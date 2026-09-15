import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@skinny/api-client';
import { ApiError, createApiClient } from '@skinny/api-client';
import {
  AVATAR_MAX_DIMENSION,
  DIRECT_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_DIMENSION,
  PHOTO_QUALITY_LADDER,
  encodeWithinBudget,
  toUploadable,
  uploadAvatar,
  uploadPhoto,
} from './upload';

/**
 * A stand-in for `XMLHttpRequest` — the only browser API that reports upload progress, and the
 * one jsdom cannot drive against a real R2 URL. The test holds the instance and fires the
 * events by hand, so the whole PUT contract the Track screen leans on is assertable.
 */
class FakeXhr {
  static last: FakeXhr | null = null;
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: Blob | null = null;
  status = 200;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }
  send(body: Blob) {
    this.body = body;
    FakeXhr.last = this;
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent);
  }
}

function withFakeXhr(): ApiClient {
  FakeXhr.last = null;
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  return createApiClient({ baseUrl: 'https://api.test', getToken: () => Promise.resolve(null) });
}

const blob = (type: string) => new Blob([new Uint8Array([1, 2, 3])], { type });

/** A blob that reports `size` bytes without allocating them. */
function sized(type: string, size: number): Blob {
  const b = blob(type);
  Object.defineProperty(b, 'size', { value: size });
  return b;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadToPresign against a fake XHR', () => {
  it('PUTs to the presigned URL with the presigned content type and reports progress to 1', async () => {
    const api = withFakeXhr();
    const fractions: number[] = [];
    const done = api.uploadToPresign('https://r2.test/photos/a.jpg', blob('image/jpeg'), 'image/jpeg', (f) =>
      fractions.push(f),
    );

    const xhr = FakeXhr.last!;
    expect(xhr.method).toBe('PUT');
    expect(xhr.url).toBe('https://r2.test/photos/a.jpg');
    expect(xhr.headers['Content-Type']).toBe('image/jpeg');

    xhr.progress(25, 100);
    xhr.progress(80, 100);
    xhr.onload!();
    await done;

    expect(fractions).toEqual([0.25, 0.8, 1]);
    // Monotonic, and it always ends at 1 so the bar never stops short of full.
    expect([...fractions].sort((a, b) => a - b)).toEqual(fractions);
    expect(fractions.at(-1)).toBe(1);
  });

  it('rejects a non-2xx response as upload_failed', async () => {
    const api = withFakeXhr();
    const done = api.uploadToPresign('https://r2.test/x', blob('image/jpeg'), 'image/jpeg');
    FakeXhr.last!.status = 403;
    FakeXhr.last!.onload!();
    await expect(done).rejects.toBeInstanceOf(ApiError);
    await expect(done).rejects.toMatchObject({ code: 'upload_failed' });
  });

  it('rejects a network failure as upload_failed', async () => {
    const api = withFakeXhr();
    const done = api.uploadToPresign('https://r2.test/x', blob('image/jpeg'), 'image/jpeg');
    FakeXhr.last!.onerror!();
    await expect(done).rejects.toMatchObject({ code: 'upload_failed' });
  });
});

describe('toUploadable (ruling R25)', () => {
  it('sends a browser-renderable photo within the byte budget up untouched', async () => {
    for (const type of DIRECT_UPLOAD_TYPES) {
      const file = sized(type, PHOTO_MAX_BYTES);
      const uploadable = await toUploadable(file);
      expect(uploadable.contentType).toBe(type);
      expect(uploadable.blob).toBe(file);
    }
  });

  it('compresses a renderable photo over the byte budget to JPEG, whatever its type', async () => {
    for (const type of DIRECT_UPLOAD_TYPES) {
      const converted = blob('image/jpeg');
      const convert = vi.fn(() => Promise.resolve(converted));
      const uploadable = await toUploadable(sized(type, PHOTO_MAX_BYTES + 1), convert);
      expect(convert).toHaveBeenCalledOnce();
      expect(uploadable).toEqual({ blob: converted, contentType: 'image/jpeg' });
    }
  });

  it('converts a HEIC from iOS Safari to JPEG before it is ever presigned', async () => {
    const converted = blob('image/jpeg');
    const convert = vi.fn(() => Promise.resolve(converted));
    const uploadable = await toUploadable(blob('image/heic'), convert);
    expect(convert).toHaveBeenCalledOnce();
    expect(uploadable).toEqual({ blob: converted, contentType: 'image/jpeg' });
  });

  it('fails as photo_invalid when nothing can decode the file', async () => {
    await expect(
      toUploadable(blob('application/pdf'), () => Promise.reject(new Error('no decoder'))),
    ).rejects.toMatchObject({ code: 'photo_invalid' });
  });
});

describe('the photo byte budget', () => {
  it('targets a few hundred KB at a phone-sharp long edge, like a chat app', () => {
    expect(PHOTO_MAX_BYTES).toBe(600 * 1024);
    expect(PHOTO_MAX_DIMENSION).toBe(1600);
    // Strictly descending, so every rung is smaller than the last.
    expect([...PHOTO_QUALITY_LADDER].sort((a, b) => b - a)).toEqual([...PHOTO_QUALITY_LADDER]);
  });

  it('stops at the first quality that fits the budget', async () => {
    const encode = vi.fn((quality: number) => Promise.resolve(sized('image/jpeg', Math.round(quality * 1000))));
    const out = await encodeWithinBudget(encode, 700, [0.9, 0.8, 0.6, 0.4]);
    expect(out.size).toBe(600);
    expect(encode.mock.calls.map(([q]) => q)).toEqual([0.9, 0.8, 0.6]);
  });

  it('settles for the last rung when nothing fits, rather than refusing the photo', async () => {
    const encode = vi.fn(() => Promise.resolve(sized('image/jpeg', 5000)));
    const out = await encodeWithinBudget(encode, 700, [0.9, 0.5]);
    expect(out.size).toBe(5000);
    expect(encode).toHaveBeenCalledTimes(2);
  });
});

describe('uploadPhoto', () => {
  it('presigns for the converted content type and answers with the R2 key', async () => {
    const presign = vi.fn(() =>
      Promise.resolve({ key: 'photos/u1/a.jpg', url: 'https://r2.test/put', expiresAt: 'x' }),
    );
    const uploadToPresign = vi.fn((_u: string, _b: Blob, _c: string, onProgress?: (f: number) => void) => {
      onProgress?.(0.5);
      return Promise.resolve();
    });
    const api = { presign, uploadToPresign } as unknown as ApiClient;
    const fractions: number[] = [];

    const key = await uploadPhoto(api, blob('image/png'), (f) => fractions.push(f));

    expect(key).toBe('photos/u1/a.jpg');
    expect(presign).toHaveBeenCalledWith({ kind: 'photo', contentType: 'image/png' });
    expect(uploadToPresign.mock.calls[0]?.[0]).toBe('https://r2.test/put');
    expect(fractions.at(-1)).toBe(1);
  });

  it('presigns a HEIC from iOS Safari as image/jpeg, after converting it (ruling R25)', async () => {
    const converted = blob('image/jpeg');
    const presign = vi.fn(() =>
      Promise.resolve({ key: 'photos/u1/b.jpg', url: 'https://r2.test/put', expiresAt: 'x' }),
    );
    const uploadToPresign = vi.fn((_u: string, _b: Blob, _c: string) => Promise.resolve());
    const api = { presign, uploadToPresign } as unknown as ApiClient;

    const key = await uploadPhoto(api, blob('image/heic'), () => {}, () => Promise.resolve(converted));

    expect(key).toBe('photos/u1/b.jpg');
    // The API accepts image/heic, but R2 would then hold bytes no feed can render.
    expect(presign).toHaveBeenCalledWith({ kind: 'photo', contentType: 'image/jpeg' });
    expect(uploadToPresign.mock.calls[0]?.[1]).toBe(converted);
    expect(uploadToPresign.mock.calls[0]?.[2]).toBe('image/jpeg');
  });

  describe('avatars', () => {
    /** 512 px covers a 96 px circle on a 3× display; the constant is the contract. */
    it('keeps the avatar bound at 512 px', () => {
      expect(AVATAR_MAX_DIMENSION).toBe(512);
      expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
    });

    it('re-encodes every avatar, a JPEG included, and presigns it as image/jpeg', async () => {
      const converted = blob('image/jpeg');
      const convert = vi.fn(() => Promise.resolve(converted));
      const presign = vi.fn(() =>
        Promise.resolve({ key: 'avatars/u1/a.jpg', url: 'https://r2.test/put', expiresAt: 'x' }),
      );
      const uploadToPresign = vi.fn((_u: string, _b: Blob, _c: string) => Promise.resolve());
      const api = { presign, uploadToPresign } as unknown as ApiClient;

      const key = await uploadAvatar(api, blob('image/jpeg'), () => {}, convert);

      // A photo of this type would go up untouched; an avatar never does — the conversion is the
      // downscale, not the format.
      expect(convert).toHaveBeenCalled();
      expect(key).toBe('avatars/u1/a.jpg');
      expect(presign).toHaveBeenCalledWith({ kind: 'avatar', contentType: 'image/jpeg' });
      expect(uploadToPresign.mock.calls[0]?.[1]).toBe(converted);
    });

    it('refuses a source over 10 MB as photo_invalid, before presigning', async () => {
      const presign = vi.fn();
      const api = { presign } as unknown as ApiClient;
      const huge = blob('image/jpeg');
      Object.defineProperty(huge, 'size', { value: MAX_UPLOAD_BYTES + 1 });

      await expect(uploadAvatar(api, huge, () => {})).rejects.toMatchObject({
        code: 'photo_invalid',
      });
      expect(presign).not.toHaveBeenCalled();
    });

    it('reports an undecodable avatar as photo_invalid rather than a canvas error', async () => {
      const api = { presign: vi.fn() } as unknown as ApiClient;
      await expect(
        uploadAvatar(api, blob('image/jpeg'), () => {}, () => Promise.reject(new Error('no canvas'))),
      ).rejects.toBeInstanceOf(ApiError);
    });
  });
});
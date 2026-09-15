import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@skinny/api-client';
import { ApiError, createApiClient } from '@skinny/api-client';
import { DIRECT_UPLOAD_TYPES, toUploadable, uploadPhoto } from './upload';

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
  it('sends a browser-renderable photo up untouched', async () => {
    for (const type of DIRECT_UPLOAD_TYPES) {
      const file = blob(type);
      const uploadable = await toUploadable(file);
      expect(uploadable.contentType).toBe(type);
      expect(uploadable.blob).toBe(file);
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
});

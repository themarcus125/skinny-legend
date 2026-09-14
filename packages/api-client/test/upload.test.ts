import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '../src/index';

/**
 * A minimal XMLHttpRequest stand-in: records what was opened and sent, then lets the test drive
 * the outcome (`finish`, `progress`, `fail`, `abort`). Vitest runs in node, where there is no
 * real XHR — and even in a browser this keeps the test off the network.
 */
class FakeXhr {
  static last: FakeXhr | null = null;
  status = 0;
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown = null;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.last = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }

  send(body: unknown) {
    this.body = body;
  }

  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent);
  }

  finish(status: number) {
    this.status = status;
    this.onload?.();
  }
}

const api = () => createApiClient({ baseUrl: 'https://api.test', getToken: async () => 'tok' });

afterEach(() => {
  vi.unstubAllGlobals();
  FakeXhr.last = null;
});

describe('uploadToPresign', () => {
  it('PUTs the blob with its content type and reports progress up to 1', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const file = new Blob(['hello']);
    const seen: number[] = [];
    const promise = api().uploadToPresign('https://r2.test/put/photo.jpg', file, 'image/jpeg', (f) => seen.push(f));

    const xhr = FakeXhr.last!;
    expect(xhr.method).toBe('PUT');
    expect(xhr.url).toBe('https://r2.test/put/photo.jpg');
    expect(xhr.headers['Content-Type']).toBe('image/jpeg');
    expect(xhr.body).toBe(file);

    xhr.progress(5, 10);
    xhr.finish(200);
    await expect(promise).resolves.toBeUndefined();
    expect(seen).toEqual([0.5, 1]);
  });

  it('throws ApiError(0, upload_failed) on a non-2xx response', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const promise = api().uploadToPresign('https://r2.test/put/photo.jpg', new Blob(['x']), 'image/jpeg');
    FakeXhr.last!.finish(403);
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ status: 0, code: 'upload_failed' });
  });

  it('throws ApiError(0, upload_failed) when the request never completes', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const promise = api().uploadToPresign('https://r2.test/put/photo.jpg', new Blob(['x']), 'image/jpeg');
    FakeXhr.last!.onerror?.();
    await expect(promise).rejects.toMatchObject({ status: 0, code: 'upload_failed' });
  });

  it('gives describeError a thrower for the upload_failed key', async () => {
    const { describeError } = await import('../src/index');
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const promise = api().uploadToPresign('https://r2.test/put/photo.jpg', new Blob(['x']), 'image/jpeg');
    FakeXhr.last!.finish(500);
    const error = await promise.catch((e: unknown) => e);
    expect(describeError(error)).toBe('errors.upload_failed');
  });
});

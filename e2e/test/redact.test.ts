import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { redactLogDir, redactSecrets } from '../src/redact.js';

/** A realistic presigned R2 PUT, the shape the API's SDK errors print. */
const PRESIGNED =
  'https://acct.r2.cloudflarestorage.com/bucket/e2e/photos/abc.jpg' +
  '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
  '&X-Amz-Credential=b1946ac92492d2347c6235b4d2611184%2F20260915%2Fauto%2Fs3%2Faws4_request' +
  '&X-Amz-Date=20260915T003000Z&X-Amz-Expires=900&X-Amz-SignedHeaders=host' +
  '&X-Amz-Signature=deadbeefcafe0123456789abcdef0123456789abcdef0123456789abcdef0123';

describe('redactSecrets', () => {
  it('strips every X-Amz value while keeping the parameter names', () => {
    const out = redactSecrets(`[api] presign failed for ${PRESIGNED} (503)`);
    expect(out).not.toContain('deadbeefcafe');
    expect(out).not.toContain('b1946ac92492d2347c6235b4d2611184');
    expect(out).toContain('X-Amz-Signature=REDACTED');
    expect(out).toContain('X-Amz-Credential=REDACTED');
    // Everything around the query string survives, so the line is still diagnosable.
    expect(out).toContain('/bucket/e2e/photos/abc.jpg?X-Amz-Algorithm=REDACTED');
    expect(out).toContain('(503)');
  });

  it('stops at the parameter boundary, not at the end of the line', () => {
    const out = redactSecrets('GET /x?X-Amz-Signature=abc&other=keepme HTTP/1.1');
    expect(out).toBe('GET /x?X-Amz-Signature=REDACTED&other=keepme HTTP/1.1');
  });

  it('redacts an X-Amz value inside a quoted JSON string', () => {
    const out = redactSecrets('{"url":"https://r2/x?X-Amz-Signature=abc123","key":"e2e/photos/a"}');
    expect(out).toBe('{"url":"https://r2/x?X-Amz-Signature=REDACTED","key":"e2e/photos/a"}');
  });

  it('redacts Authorization in header, JSON and object-dump shapes', () => {
    expect(redactSecrets('Authorization: Bearer eyJhbGciOi.token.sig')).toBe(
      'Authorization: REDACTED',
    );
    expect(redactSecrets('{"authorization":"Bearer eyJhbGciOi.token.sig"}')).toBe(
      '{"authorization":REDACTED}',
    );
    expect(redactSecrets("headers: { authorization: 'Bearer secret', host: 'localhost' }")).toBe(
      "headers: { authorization: REDACTED, host: 'localhost' }",
    );
  });

  it('leaves ordinary lines alone and is idempotent', () => {
    const line = '[api] POST /entries 200 in 812ms';
    expect(redactSecrets(line)).toBe(line);
    const once = redactSecrets(PRESIGNED);
    expect(redactSecrets(once)).toBe(once);
  });
});

describe('redactLogDir', () => {
  it('rewrites only the *.log files that carried a secret', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'redact-'));
    writeFileSync(join(dir, 'api.log'), `put ${PRESIGNED}\nAuthorization: Bearer abc\n`);
    writeFileSync(join(dir, 'web.log'), 'vite preview ready\n');
    writeFileSync(join(dir, 'notes.txt'), `put ${PRESIGNED}\n`);

    const changed = await redactLogDir(dir);

    expect(changed).toEqual(['api.log']);
    const api = readFileSync(join(dir, 'api.log'), 'utf8');
    expect(api).not.toContain('deadbeefcafe');
    expect(api).toContain('Authorization: REDACTED');
    expect(readFileSync(join(dir, 'web.log'), 'utf8')).toBe('vite preview ready\n');
    // Not a log file: left exactly as it was, so the pass cannot damage unrelated output.
    expect(readFileSync(join(dir, 'notes.txt'), 'utf8')).toContain('deadbeefcafe');
  });

  it('treats a missing directory as nothing to do', async () => {
    expect(await redactLogDir(join(tmpdir(), 'redact-does-not-exist-12345'))).toEqual([]);
  });
});

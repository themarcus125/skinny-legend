import { readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const REDACTED = 'REDACTED';

/**
 * The value of any `X-Amz-*` query parameter. Presigned R2 URLs reach the service logs through
 * the SDK's error messages and Hono's request logging, and they carry `X-Amz-Signature` plus an
 * `X-Amz-Credential` with the access key id inside it — a working, 15-minute PUT for anyone who
 * downloads the CI artifact. The parameter name is kept so a reader can still see what was there.
 */
const AMZ_QUERY = /([?&]X-Amz-[A-Za-z0-9-]+=)[^&\s"'<>\\]*/gi;

/**
 * An `Authorization` header value, in the three shapes a log line uses: a real header
 * (`Authorization: Bearer ey…`), a JSON object (`"authorization":"Bearer ey…"`) and an
 * object dump (`authorization: 'Bearer ey…'`). An unquoted value runs to the end of the line —
 * the scheme and the credential are two words, and over-redacting the tail of a header line is
 * always safer than leaving half a bearer token in a CI artifact.
 */
const AUTHORIZATION = /(["']?authorization["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\r\n]*)/gi;

/** Replaces every secret this suite is known to log. Safe to run over already-redacted text. */
export function redactSecrets(text: string): string {
  return text.replace(AMZ_QUERY, `$1${REDACTED}`).replace(AUTHORIZATION, `$1${REDACTED}`);
}

/**
 * Rewrites every `*.log` in `dir` through {@link redactSecrets}, in place. Returns the files that
 * actually changed. A missing directory is not an error: a run that failed before any service
 * started has no logs to clean.
 */
export async function redactLogDir(dir: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const changed: string[] = [];
  for (const name of names) {
    if (!name.endsWith('.log')) continue;
    const path = join(dir, name);
    const before = readFileSync(path, 'utf8');
    const after = redactSecrets(before);
    if (after === before) continue;
    writeFileSync(path, after, 'utf8');
    changed.push(name);
  }
  return changed;
}

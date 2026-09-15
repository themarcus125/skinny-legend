/**
 * The two pure functions the service worker's thumbnail route is built from.
 *
 * They are inlined into `dist/sw.js` by `vite.config.ts`: Workbox's `generateSW` serialises a
 * runtime-caching route by *stringifying* the functions it is handed, so anything these bodies
 * reference from module scope would land in the worker as an undefined identifier. Hence: no
 * imports, no closures, no constants outside the function bodies — every value they need is
 * either an argument or written out inline. `vite.config.ts` pins that by inlining
 * `Function.prototype.toString()` rather than passing a closure.
 */

/**
 * Is this host the R2 bucket that serves entry thumbnails?
 *
 * `*.r2.dev` is the bucket's own public hostname and `*.r2.cloudflarestorage.com` the S3
 * endpoint; `publicHost` is the custom domain from `VITE_R2_PUBLIC_HOST`, for a deployment that
 * puts its own name in front of the bucket (`docs/deploy/r2.md`).
 */
export function isThumbnailHost(hostname: string, publicHost: string | null): boolean {
  if (publicHost && hostname === publicHost) return true;
  return /\.r2\.dev$/.test(hostname) || /\.r2\.cloudflarestorage\.com$/.test(hostname);
}

/**
 * The cache key for a thumbnail: the URL **without its query string**.
 *
 * `apps/api/src/services/storage.ts` hands out presigned GET URLs with `expiresIn: 3600`, so the
 * same object arrives under a new `X-Amz-Signature` (and a new `X-Amz-Date`) every hour. Keyed on
 * the full URL, a `CacheFirst` route would store a fresh copy every hour and hit almost never —
 * the worst of both worlds. The object path is immutable (the key is the entry's storage key), so
 * dropping the query is what makes the key stable, and re-signing does not invalidate the cache.
 *
 * Only the *key* loses the query; the request that goes to the network on a miss keeps its
 * signature, or R2 would answer 403.
 */
export function thumbnailCacheKey(href: string): string {
  const url = new URL(href);
  url.search = '';
  return url.href;
}

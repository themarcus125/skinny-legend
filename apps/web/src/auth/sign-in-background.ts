export type SignInBackgroundMode = 'video' | 'gradient';

/** Where the looping clip lives, copied from `ios/SkinnyLegend/Resources/signin-bg.mp4`. */
export const SIGN_IN_VIDEO_SRC = '/signin-bg.mp4';

/**
 * A 540px-wide JPEG of the clip's first frame (44 KB), generated with
 * `ffmpeg -i signin-bg.mp4 -frames:v 1 -vf scale=540:-1 -q:v 6 signin-bg-poster.jpg`.
 *
 * The clip itself is 4.1 MB and loads `preload="metadata"`, so the poster is what the member
 * actually sees for the first second on a slow connection — and it is what the scrim darkens.
 */
export const SIGN_IN_POSTER_SRC = '/signin-bg-poster.jpg';

/**
 * Port of `SignInBackground.mode` (`ios/SkinnyLegend/Features/Auth/SignInBackground.swift`).
 *
 * `assetAvailable` is fed from whether the clip is expected to be there **and** the `<video>`
 * has not fired `error` — exactly as the iOS view reports `AVPlayerItem` failures back through
 * its binding, so a mid-session player failure drops to the gradient rather than a black frame.
 */
export function signInBackgroundMode({
  reduceMotion,
  assetAvailable,
}: {
  reduceMotion: boolean;
  assetAvailable: boolean;
}): SignInBackgroundMode {
  return reduceMotion || !assetAvailable ? 'gradient' : 'video';
}

/** `prefers-reduced-motion: reduce`. False where `matchMedia` is missing (SSR, old jsdom). */
export function prefersReducedMotion(): boolean {
  if (typeof matchMedia !== 'function') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

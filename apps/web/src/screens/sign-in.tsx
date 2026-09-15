import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { cn } from '@skinny/ui';
import { FlameGlyph, GoogleGlyph } from '@/app/icons';
import { SignInError, useSession } from '@/auth/session';
import {
  prefersReducedMotion,
  SIGN_IN_POSTER_SRC,
  SIGN_IN_VIDEO_SRC,
  signInBackgroundMode,
  type SignInBackgroundMode,
} from '@/auth/sign-in-background';
import { writeMockOverride } from '@/lib/app-mode';
import { Button } from '@/ui/button';

/**
 * Port of `SignInView` + `SignInBackground`
 * (`ios/SkinnyLegend/Features/Auth/`): the looping clip behind the wordmark, one 54px primary
 * Google button, and — in a dev build only — the sample-data escape hatch.
 *
 * The background falls back to the palette gradient under `prefers-reduced-motion` or when the
 * clip fails to load, exactly as the iOS view reports `AVPlayerItem` failures back through its
 * binding. Foreground ink follows the mode: white over the video's dark scrim, the normal
 * palette over the gradient.
 */
export function Component() {
  const t = useTranslations();
  const session = useSession();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setReduceMotion(query.matches);
    };
    update();
    query.addEventListener('change', update);
    return () => {
      query.removeEventListener('change', update);
    };
  }, []);

  const mode: SignInBackgroundMode = signInBackgroundMode({
    reduceMotion,
    assetAvailable: !failed,
  });

  // Autoplay is refused often enough (Low Power Mode, Data Saver, a paused media engine) that
  // the refusal has to demote the background rather than leave a frozen first frame. Older
  // engines return undefined instead of a promise, and jsdom throws outright, so both shapes of
  // failure are caught.
  useEffect(() => {
    if (mode !== 'video') return;
    const video = videoRef.current;
    if (!video) return;
    const fallBack = () => {
      setFailed(true);
    };
    try {
      const started: Promise<void> | undefined = video.play();
      if (started !== undefined) void started.catch(fallBack);
    } catch {
      fallBack();
    }
  }, [mode]);

  const onVideo = mode === 'video';

  // A failed sign-in is this screen's state, never the session's: `SessionGate` handles an
  // `error` session before it routes, so routing the failure through it would unmount the very
  // screen the member is standing on.
  const [signInError, setSignInError] = useState<string | null>(null);
  const signIn = useCallback(() => {
    setSignInError(null);
    void session.signIn().catch((error: unknown) => {
      setSignInError(error instanceof SignInError ? error.messageKey : 'auth.failed');
    });
  }, [session]);

  const enterSampleData = useCallback(() => {
    writeMockOverride(true);
    window.location.reload();
  }, []);

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      {/* The gradient is always painted, underneath everything: the clip is 4.1 MB on
          `preload="metadata"`, so this is what the first frames and the poster arrive over, and
          what holds text contrast if neither ever does. */}
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-0 -z-20 bg-background',
          'bg-[radial-gradient(120%_80%_at_50%_0%,var(--primary-soft),transparent_70%)]',
        )}
      />
      {onVideo && (
        <>
          <video
            ref={videoRef}
            className="absolute inset-0 -z-10 size-full object-cover"
            src={SIGN_IN_VIDEO_SRC}
            poster={SIGN_IN_POSTER_SRC}
            autoPlay
            muted
            loop
            playsInline
            // `metadata`, not `auto`: 4.1 MB has no business being fetched eagerly on a mobile
            // connection. The poster carries the first second; the clip streams in behind it.
            preload="metadata"
            aria-hidden="true"
            tabIndex={-1}
            onError={() => {
              setFailed(true);
            }}
          />
          {/* Matches the iOS scrim: black 15% → 65%, so white ink clears WCAG AA on any frame. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-linear-to-b from-black/15 to-black/65"
          />
        </>
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pt-16">
        {/* iOS paints the mark `Theme.primarySoft`, which is vanilla in light and a near-black
            olive in dark — invisible over the video. `brand` IS that vanilla in both themes, so
            the mark over the clip is identical to iOS's light appearance either way; over the
            gradient it takes `primary`, which is ink in light and vanilla in dark. */}
        <FlameGlyph className={cn('size-18', onVideo ? 'text-brand' : 'text-primary')} />
        <h1
          className={cn(
            'type-h1 text-center whitespace-pre-line',
            onVideo ? 'text-white' : 'text-foreground',
          )}
        >
          {t('auth.wordmark')}
        </h1>
        <p
          className={cn(
            'type-body-medium text-center',
            onVideo ? 'text-white/85' : 'text-foreground-secondary',
          )}
        >
          {t('auth.tagline')}
        </p>
      </div>

      <div className="flex flex-col gap-3 px-6 pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
        <Button size="lg" fullWidth onClick={signIn} disabled={session.isWorking}>
          <GoogleGlyph className="size-5" />
          {t('auth.google')}
        </Button>

        {signInError && (
          <p role="alert" className="type-caption text-center text-destructive">
            {t(signInError)}
          </p>
        )}

        {import.meta.env.DEV && (
          // Dev builds only: run the whole app against the mock without a rebuild, so the UI can
          // be worked on with no backend and no Firebase project. Task 12 adds the way out.
          <Button
            variant="ghost"
            fullWidth
            onClick={enterSampleData}
            // The ghost variant's ink is `primary`, which is invisible over the video.
            className={onVideo ? 'text-white' : undefined}
          >
            {t('auth.sampleData')}
          </Button>
        )}
      </div>
    </main>
  );
}

Component.displayName = 'SignInScreen';

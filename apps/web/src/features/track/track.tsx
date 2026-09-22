import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import { AlertBanner, ProgressBar, SurfaceCard } from '@skinny/ui';
import { CameraGlyph, CloseGlyph, PhotoStackGlyph, SparklesGlyph } from '@/app/icons';
import { LargeTitle } from '@/app/large-title';
import { PullToRefresh } from '@/app/pull-to-refresh';
import { useSession } from '@/auth/session';
import { describeError, useApi } from '@/lib/api';
import { readExif } from '@/lib/exif';
import { currentPosition } from '@/lib/geo';
import { queryKeys } from '@/lib/query';
import { uploadPhoto } from '@/lib/upload';
import { usePush } from '@/push/use-push';
import { Button } from '@/ui/button';
import { AccountHistory } from '@/features/account/history';
import { VerdictSheet } from './verdict-sheet';
import {
  adoptConfirmation,
  beginSave,
  claimCelebration,
  failSave,
  initVerdictState,
  needsSave,
  outcome,
  patchBody,
  projectedPoints,
  type VerdictState,
} from './verdict-model';

/** How long the celebration banner stays up before the screen hands over to Trang chủ. */
const CELEBRATION_MS = 1_800;

type Phase =
  | { kind: 'idle' }
  | { kind: 'uploading'; fraction: number }
  | { kind: 'analyzing' }
  // The picked file is kept so "Thử lại" can re-run the pipeline; dropping it would make the
  // member go back to the camera for a photo the app already has.
  | { kind: 'failed'; errorKey: string; file: File };

export interface TrackProps {
  /**
   * Fires once per entry that actually counted, with the points it earned. Task 13 hangs the
   * "turn notifications on?" prompt here — spec §E asks for it after the *first confirmed
   * entry*, never at launch, so this is the only place that knows when that happened.
   */
  onTracked?: (points: number) => void;
}

/**
 * Ghi nhận — port of `ios/SkinnyLegend/Features/Track/TrackView.swift`.
 *
 * Two file inputs stand in for `CameraPicker` and `PhotosPicker`: one with
 * `capture="environment"` (the rear camera, straight into the capture UI on iOS Safari and
 * Android Chrome) and one without (the library). Picking a photo runs the same pipeline iOS
 * runs — read the capture time and the fix, convert if the browser handed us HEIC, presign,
 * PUT with progress, then `POST /entries` — and opens the verdict sheet on the response.
 */
export function Track({ onTracked }: TrackProps) {
  const t = useTranslations();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const navigateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [preview, setPreview] = useState<string | null>(null);
  const [point, setPoint] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [sheet, setSheet] = useState<VerdictState | null>(null);
  const [celebration, setCelebration] = useState<number | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (navigateTimer.current !== null) clearTimeout(navigateTimer.current);
    };
  }, []);

  // An object URL is a document-lifetime handle; leaving it behind leaks the whole photo.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const busy = phase.kind === 'uploading' || phase.kind === 'analyzing';

  const handleFile = useCallback(
    async (file: File) => {
      // Created here, not inside the updater: React may call an updater twice in StrictMode,
      // which would leak the second URL.
      const objectUrl = URL.createObjectURL(file);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return objectUrl;
      });
      setPhase({ kind: 'uploading', fraction: 0 });
      try {
        // Spec §7: the fix is fetched while the upload runs. EXIF first because it is free and
        // exact; `navigator.geolocation` only when the photo carries no GPS block — a denial or
        // a timeout is not an error, it just leaves the entry without coordinates.
        const exif = await readExif(file);
        const fix =
          exif.lat !== null && exif.lng !== null
            ? { lat: exif.lat, lng: exif.lng }
            : await currentPosition();
        if (!alive.current) return;
        setPoint({ lat: fix?.lat ?? null, lng: fix?.lng ?? null });

        const photoKey = await uploadPhoto(api, file, (fraction) => {
          if (alive.current) setPhase({ kind: 'uploading', fraction });
        });
        if (!alive.current) return;

        setPhase({ kind: 'analyzing' });
        const response = await api.createEntry({
          photoKey,
          takenAt: exif.takenAt ?? new Date().toISOString(),
          ...(fix ? { lat: fix.lat, lng: fix.lng } : {}),
        });
        if (!alive.current) return;

        setPhase({ kind: 'idle' });
        setSheet(
          initVerdictState({
            entry: response.entry,
            // `POST /entries` always answers with a verdict; a response without one is treated
            // as an unreadable photo rather than a history edit, so the member still gets the
            // chip picker and a "Xác nhận" instead of a sheet that claims to be tracked.
            mode: {
              kind: 'created',
              verdict: response.verdict ?? {
                categories: [],
                healthy: null,
                confidence: 0,
                reason: '',
                model: '',
                failed: true,
              },
            },
            capsHit: response.capsHit,
            cappedCategories: response.cappedCategories,
            projectedPoints: response.projectedPoints,
            placeName: response.entry.placeName,
            placeSource: response.entry.placeSource,
            title: response.entry.title,
            note: response.entry.note,
          }),
        );
      } catch (error) {
        if (alive.current) setPhase({ kind: 'failed', errorKey: describeError(error), file });
      }
    },
    [api],
  );

  /**
   * Runs on every way out of the sheet — "Xong", "Lưu thay đổi", "Xác nhận", "Huỷ" or Escape.
   * An abandoned pending entry counts nothing and leaves the photo in place, exactly as on iOS.
   */
  const dismiss = useCallback(
    (final: VerdictState) => {
      setSheet(null);
      const result = outcome(final);
      if (result === 'abandoned') return;

      for (const key of [
        queryKeys.dashboard,
        queryKeys.feed,
        queryKeys.leaderboard,
        queryKeys.trends,
        queryKeys.myEntries,
        queryKeys.map,
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }

      const points = projectedPoints(final);
      // `claimCelebration` is the one-shot guard: a sheet that reappears must not replay it.
      const { celebrate } = claimCelebration(final);
      if (celebrate) setCelebration(points);
      onTracked?.(points);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
      setPhase({ kind: 'idle' });
      navigateTimer.current = setTimeout(() => {
        // React Router 7's `navigate` returns a promise; nothing here waits on the transition.
        if (alive.current) void navigate('/');
      }, CELEBRATION_MS);
    },
    [navigate, onTracked, queryClient],
  );

  const primary = useCallback(() => {
    if (!sheet) return;
    if (!needsSave(sheet)) {
      dismiss(sheet);
      return;
    }
    const saving = beginSave(sheet);
    setSheet(saving);
    void api
      .confirmEntry(saving.entry.id, patchBody(saving))
      .then((response) => {
        if (alive.current) dismiss(adoptConfirmation(saving, response));
      })
      .catch((error: unknown) => {
        if (alive.current) setSheet(failSave(saving, error));
      });
  }, [api, dismiss, sheet]);

  return (
    <>
      <PullToRefresh keys={[queryKeys.myEntries, queryKeys.dashboard]} />
      <LargeTitle title={t('track.title')} />
      <div className="flex flex-col gap-4 px-4 pt-2 pb-8">
        <SurfaceCard as="section" className="flex flex-col gap-2">
          <h2 className="type-h2">{t('overview.checklist')}</h2>
          <p className="type-caption text-foreground-secondary">{t('track.prompt')}</p>
        </SurfaceCard>

        {celebration !== null ? (
          <AlertBanner
            tone="success"
            title={t('track.celebration', { 0: celebration })}
            description={t('track.trackedStreak')}
          />
        ) : null}

        {preview ? (
          <div className="relative">
            <img
              src={preview}
              alt={t('track.photoAlt')}
              className="bg-surface-2 h-[240px] w-full rounded-xl object-cover"
            />
            <button
              type="button"
              aria-label={t('track.removePhoto')}
              onClick={() => {
                setPreview((old) => {
                  if (old) URL.revokeObjectURL(old);
                  return null;
                });
                setPhase({ kind: 'idle' });
              }}
              className="bg-card border-border text-foreground absolute top-2 right-2 grid size-11 place-items-center rounded-full border shadow-card"
            >
              <CloseGlyph className="size-4" />
            </button>
          </div>
        ) : null}

        {phase.kind === 'uploading' ? (
          <SurfaceCard as="section" className="flex flex-col gap-3">
            <p className="type-body-medium">
              {t('track.uploading', { 0: Math.round(phase.fraction * 100) })}
            </p>
            <ProgressBar
              value={phase.fraction}
              max={1}
              label={t('track.uploading', { 0: Math.round(phase.fraction * 100) })}
            />
          </SurfaceCard>
        ) : null}

        {phase.kind === 'analyzing' ? (
          <SurfaceCard as="section" className="flex items-center gap-3">
            {/* The AI at work: an amber sparkle that breathes while the verdict is on its way. */}
            <span
              aria-hidden="true"
              data-testid="track-analyzing-sparkle"
              className="bg-warning-soft text-warning grid size-10 shrink-0 animate-pulse place-items-center rounded-full motion-reduce:animate-none"
            >
              <SparklesGlyph className="size-5" />
            </span>
            <p className="type-body-medium" data-testid="track-analyzing">
              {t('track.analyzing')}
            </p>
          </SurfaceCard>
        ) : null}

        {phase.kind === 'failed' ? (
          <AlertBanner
            tone="destructive"
            title={t('track.analyzeFailed')}
            description={t(phase.errorKey)}
            action={
              <Button
                size="sm"
                variant="secondary"
                data-testid="track-retry"
                onClick={() => void handleFile(phase.file)}
              >
                {t('common.retry')}
              </Button>
            }
          />
        ) : null}

        <div className="flex gap-3">
          {/* `capture` asks for the rear camera; a desktop browser ignores it and opens a picker. */}
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            data-testid="camera-input"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void handleFile(file);
            }}
          />
          <input
            ref={libraryInput}
            type="file"
            accept="image/*"
            data-testid="library-input"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void handleFile(file);
            }}
          />
          <Button size="lg" fullWidth disabled={busy} onClick={() => cameraInput.current?.click()}>
            <CameraGlyph className="size-5" />
            {t('track.takePhoto')}
          </Button>
          <Button
            size="lg"
            fullWidth
            variant="secondary"
            disabled={busy}
            onClick={() => libraryInput.current?.click()}
          >
            <PhotoStackGlyph className="size-5" />
            {t('track.library')}
          </Button>
        </div>

        {/* The last few entries, right under the camera: the rest page in as the list is scrolled. */}
        <AccountHistory />
      </div>

      {sheet ? (
        <VerdictSheet
          state={sheet}
          onChange={setSheet}
          lat={point.lat}
          lng={point.lng}
          onDismiss={() => dismiss(sheet)}
          onPrimary={primary}
        />
      ) : null}
    </>
  );
}

/**
 * The routed screen: `Track` with the push prompt hung off `onTracked`.
 *
 * Reminders default to ON. A confirmed entry is the surest moment to ask — the member just
 * tapped, so even iOS Safari lets the prompt show — and `requestIfUndecided` is the
 * once-per-user-id guard, so every tracked entry can call it and only the first one prompts. The plain `Track` stays prop-driven so the
 * feature tests never stand a registrar up.
 */
export function TrackScreen() {
  const session = useSession();
  const { registrar } = usePush();
  const userId =
    session.status === 'active' || session.status === 'pending' ? session.user.id : null;

  const onTracked = useCallback(() => {
    if (userId === null) return;
    void registrar.requestIfUndecided(userId);
  }, [registrar, userId]);

  return <Track onTracked={onTracked} />;
}

/** React Router 7's lazy-route convention. */
export const Component = TrackScreen;

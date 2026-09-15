import { useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import type { PatchMeInput, UserDto } from '@skinny/api-client';
import { AlertBanner, Avatar, ProgressBar } from '@skinny/ui';
import { useSession } from '@/auth/session';
import { describeError, useApi } from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { uploadAvatar } from '@/lib/upload';
import { Button } from '@/ui/button';
import { SheetShell } from './sheet';

/** `patchMeBody.displayName` is `min(1).max(40)`; validated here so a bad name costs no request. */
export const NAME_MAX_LENGTH = 40;

/** Diameter of the editable avatar — `ProfileEditSheet`'s 96. */
const EDIT_AVATAR = 96;

export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= NAME_MAX_LENGTH;
}

/**
 * "Hồ sơ" — port of `ios/SkinnyLegend/Features/Account/ProfileEditSheet.swift`.
 *
 * The save order is the iOS model's: a picked avatar goes up through `presign({ kind: 'avatar' })`
 * → PUT first, then **one** `PATCH /me` carries both fields, so a failed upload never leaves the
 * row half-updated. The name is sent only when it actually changed — `patchMeBody` rejects an
 * empty body, and re-sending the same name would be a pointless write.
 *
 * On success the session's user row is replaced in place (no round trip) and the two queries that
 * render a member's name and face — `me` and the leaderboard — are invalidated.
 */
export function ProfileEditSheet({
  user,
  avatarUrl,
  onClose,
  convert,
}: {
  user: UserDto;
  /** The signed URL the leaderboard row carries; `/me` only knows the storage key. */
  avatarUrl?: string | null;
  onClose: () => void;
  /** The avatar conversion seam — injected in tests, where jsdom has no canvas to decode with. */
  convert?: (file: Blob) => Promise<Blob>;
}) {
  const t = useTranslations();
  const api = useApi();
  const queryClient = useQueryClient();
  const { setUser } = useSession();
  const nameId = useId();
  const fileId = useId();

  const [name, setName] = useState(user.displayName);
  const [picked, setPicked] = useState<{ file: File; preview: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // The object URL outlives every render that reads it and is revoked when it is replaced or the
  // sheet closes; leaking one pins the whole decoded image in memory.
  useEffect(() => {
    const preview = picked?.preview;
    return preview ? () => URL.revokeObjectURL(preview) : undefined;
  }, [picked?.preview]);

  const trimmed = name.trim();
  const changed = trimmed !== user.displayName || picked !== null;
  const canSave = !isSaving && isValidName(name) && changed;

  const save = () => {
    if (!canSave) return;
    setIsSaving(true);
    setErrorKey(null);
    void (async () => {
      try {
        let avatarKey: string | undefined;
        if (picked) {
          setProgress(0);
          avatarKey = await uploadAvatar(
            api,
            picked.file,
            (fraction) => {
              if (alive.current) setProgress(fraction);
            },
            convert,
          );
        }
        const patch: PatchMeInput = {
          ...(trimmed === user.displayName ? {} : { displayName: trimmed }),
          ...(avatarKey === undefined ? {} : { avatarKey }),
        };
        const updated = await api.updateMe(patch);
        if (!alive.current) return;
        setUser(updated);
        void queryClient.invalidateQueries({ queryKey: queryKeys.me });
        void queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard });
        onClose();
      } catch (error) {
        if (!alive.current) return;
        // The picked file is kept on purpose: the banner's "Thử lại" re-runs the whole save,
        // upload included, rather than making the member find the photo again.
        setIsSaving(false);
        setProgress(null);
        setErrorKey(describeError(error));
      }
    })();
  };

  return (
    <SheetShell
      testId="profile-sheet"
      title={t('account.profile')}
      onDismiss={onClose}
      footer={
        <Button size="lg" fullWidth disabled={!canSave} onClick={save} data-testid="profile-save">
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      }
    >
      <div className="flex flex-col items-center gap-3">
        {picked ? (
          <img
            data-testid="avatar-preview"
            src={picked.preview}
            alt=""
            aria-hidden="true"
            className="bg-surface-2 size-24 rounded-full object-cover"
          />
        ) : (
          <Avatar name={user.displayName} src={avatarUrl} size={EDIT_AVATAR} />
        )}
        {/*
         * A real `<input type="file">`, labelled rather than hidden behind a button that clicks
         * it: iOS Safari only opens the camera/library for a genuine file input, and a label is
         * the one way to restyle it that keeps the keyboard and screen-reader behaviour.
         */}
        <label
          htmlFor={fileId}
          className="border-border-strong bg-card text-foreground type-body-medium inline-flex h-11 cursor-pointer items-center rounded-md border px-4 font-medium"
        >
          {t('account.changeAvatar')}
        </label>
        <input
          id={fileId}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setPicked({ file, preview: URL.createObjectURL(file) });
            setErrorKey(null);
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="type-label text-foreground-subtle">
          {t('account.displayName')}
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          maxLength={NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
          className="border-border bg-card text-foreground type-body-medium outline-ring h-11 rounded-md border px-3"
        />
      </div>

      {progress !== null && isSaving ? (
        <ProgressBar
          value={progress}
          max={1}
          label={t('track.uploading', { 0: Math.round(progress * 100) })}
        />
      ) : null}

      {errorKey ? (
        <AlertBanner
          tone="destructive"
          title={t('account.saveFailed')}
          description={t(errorKey)}
          action={
            <Button size="sm" variant="secondary" onClick={save}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : null}
    </SheetShell>
  );
}

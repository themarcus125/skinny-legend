import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import { cn } from '@skinny/ui';
import { CloseGlyph } from '@/app/icons';
import { observeForegroundMessages, type PushMessage } from './messaging';

/** How long a toast stays before it dismisses itself. */
export const TOAST_MS = 6000;

/**
 * An in-app notification banner.
 *
 * A push that arrives while the tab is focused is never shown by the browser — that is the
 * service worker's job, and only when the app is *not* in front — so the app renders it itself.
 * This is the web's answer to `UNUserNotificationCenter`'s `.banner` presentation option, which
 * is what iOS asks for in the foreground.
 *
 * `role="status"` (polite): a reminder is not an interruption, so a screen reader announces it
 * at the next pause rather than cutting the reader off. Deliberately not a library — one banner,
 * one at a time, is the whole requirement.
 */
export function Toast({
  title,
  body,
  onOpen,
  onClose,
}: {
  title: string;
  body: string;
  onOpen: () => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  return (
    <div
      role="status"
      data-testid="push-toast"
      className={cn(
        'fixed inset-x-3 z-50 flex items-start gap-2.5 rounded-lg px-3.5 py-3',
        'bg-card border-border text-foreground border shadow-lg',
        'top-[calc(env(safe-area-inset-top)+0.75rem)]',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        data-testid="push-toast-open"
        className="outline-ring min-w-0 flex-1 text-left"
      >
        {title ? <span className="type-body-medium block truncate">{title}</span> : null}
        {body ? (
          <span className="type-caption text-foreground-secondary mt-0.5 block">{body}</span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.close')}
        className="outline-ring text-foreground-subtle -m-1 shrink-0 p-1"
      >
        <CloseGlyph className="size-4" />
      </button>
    </div>
  );
}

/**
 * Subscribes to foreground FCM messages and renders the most recent one. Mounted once, inside
 * the app shell, so the toast is only ever possible behind a signed-in session.
 *
 * A browser with no messaging support (or a mock/preview build with no Firebase project) simply
 * never gets a callback, so this renders nothing and costs one dynamic import that resolves to
 * `null`.
 */
export function PushToastHost() {
  const [message, setMessage] = useState<PushMessage | null>(null);
  const navigate = useNavigate();

  useEffect(() => observeForegroundMessages(setMessage), []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      setMessage(null);
    }, TOAST_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [message]);

  const open = useCallback(() => {
    const target = message?.deepLink ?? '/track';
    setMessage(null);
    void navigate(target);
  }, [message, navigate]);

  if (!message) return null;
  return (
    <Toast
      title={message.title}
      body={message.body}
      onOpen={open}
      onClose={() => {
        setMessage(null);
      }}
    />
  );
}

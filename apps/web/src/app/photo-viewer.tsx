import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { cn } from '@skinny/ui';
import { CloseGlyph } from './icons';
import { useModalSheet } from './use-modal-sheet';

export interface ViewerPhoto {
  /** The full photo; the thumbnail stands in when the payload carries nothing larger. */
  src: string;
  alt?: string;
}

interface PhotoViewerApi {
  open: (photo: ViewerPhoto) => void;
}

/** A no-op outside the provider, so a photo in a test tree or a preview is still just a photo. */
const PhotoViewerContext = createContext<PhotoViewerApi>({ open: () => undefined });

export function usePhotoViewer(): PhotoViewerApi {
  return useContext(PhotoViewerContext);
}

/**
 * The one image viewer for the app: any photo anywhere — a feed row, a pin card, a history row,
 * the verdict sheet — opens here, full-screen on black, and a tap or Escape closes it. Mounted
 * once in the shell so it sits over whatever sheet the photo was tapped in; `useModalSheet`
 * gives it the same focus trap and page lock as the sheets, and its stack makes one Escape close
 * only the viewer.
 */
export function PhotoViewerProvider({ children }: { children: ReactNode }) {
  const [photo, setPhoto] = useState<ViewerPhoto | null>(null);
  const open = useCallback((next: ViewerPhoto) => setPhoto(next), []);
  const close = useCallback(() => setPhoto(null), []);
  const api = useMemo(() => ({ open }), [open]);
  return (
    <PhotoViewerContext.Provider value={api}>
      {children}
      {photo ? <PhotoViewer photo={photo} onDismiss={close} /> : null}
    </PhotoViewerContext.Provider>
  );
}

function PhotoViewer({ photo, onDismiss }: { photo: ViewerPhoto; onDismiss: () => void }) {
  const t = useTranslations();
  const panel = useRef<HTMLDivElement>(null);
  useModalSheet({ panelRef: panel, onDismiss });
  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label={photo.alt ?? t('common.viewPhoto')}
      tabIndex={-1}
      data-testid="photo-viewer"
      onClick={onDismiss}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black outline-none"
    >
      <img
        src={photo.src}
        alt={photo.alt ?? ''}
        className="h-full w-full object-contain select-none"
        draggable={false}
      />
      <button
        type="button"
        aria-label={t('common.close')}
        data-testid="photo-viewer-close"
        onClick={onDismiss}
        className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-3 grid size-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur"
      >
        <CloseGlyph className="size-4" />
      </button>
    </div>
  );
}

export interface PhotoButtonProps {
  /** What the row shows — usually the thumbnail. */
  src: string;
  /** What the viewer shows; falls back to `src`. */
  full?: string | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
}

/**
 * A photo that opens in the viewer. It wraps the `<img>` in a real button so the tap target is
 * announced and focusable; the image itself stays decorative (`alt=""`) because the row's text
 * already says what it is, and the button carries the "Xem ảnh" name instead.
 */
export function PhotoButton({ src, full, alt, className, imgClassName }: PhotoButtonProps) {
  const t = useTranslations();
  const { open } = usePhotoViewer();
  return (
    <button
      type="button"
      aria-label={t('common.viewPhoto')}
      data-testid="photo-button"
      onClick={(event) => {
        // A photo inside a tappable row must open the viewer, not the row.
        event.stopPropagation();
        open({ src: full ?? src, alt });
      }}
      className={cn('block shrink-0 overflow-hidden outline-ring', className)}
    >
      <img src={src} alt="" aria-hidden="true" className={cn('block h-full w-full object-cover', imgClassName)} />
    </button>
  );
}

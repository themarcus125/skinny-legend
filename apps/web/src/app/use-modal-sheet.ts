import { useEffect, useRef, type RefObject } from 'react';

export interface ModalSheetOptions {
  /** The panel element — the one carrying `role="dialog"` and `tabIndex={-1}`. */
  panelRef: RefObject<HTMLElement | null>;
  /** Escape, and whatever else the sheet wants to treat as a dismissal. */
  onDismiss: () => void;
}

/**
 * Everything that makes a `role="dialog" aria-modal` overlay actually modal, in one place:
 *
 * 1. **Focus moves into the panel on mount**, so a keyboard or screen-reader user is *in* the
 *    sheet rather than still standing on the page behind it.
 * 2. **Escape dismisses, and Tab cycles inside the panel.** A modal that leaks focus to the tab
 *    bar behind it is not modal.
 * 3. **The page behind stops scrolling** (`body { overflow: hidden }`), restored on unmount.
 *    iOS Safari will happily scroll the document under a fixed overlay, which reads as a broken
 *    sheet; the panel's own scroller should also carry `overscroll-contain` so a flick at its
 *    end does not chain out to the page.
 * 4. **Focus returns to the opener** on unmount — otherwise dismissal drops the reader at the
 *    top of the document with no idea where they were.
 *
 * A native `<dialog>` would give all four for free, but jsdom implements neither `showModal()`
 * nor its focus behaviour, so the sheet would be untestable.
 *
 * `onDismiss` is read through a ref on purpose: it is a fresh arrow on every render of the
 * screen above, and a listener that re-subscribed on it would re-run the focus effect on every
 * keystroke — which is exactly the bug Task 8's review caught in the verdict sheet's place
 * field. Extracted from `features/track/verdict-sheet.tsx` when the map's cluster sheet needed
 * the same four behaviours; both sheets now share this one copy.
 *
 * **Stacking.** Sheets nest — the Account history opens a delete confirmation *inside* the verdict
 * sheet — so the hooks keep a module-level stack and only the topmost one acts: one Escape closes
 * one sheet, Tab cycles inside the sheet the reader is actually in, and the page's scroll is
 * restored when the stack empties rather than when the inner sheet unmounts (which would let the
 * page behind scroll again while the outer sheet is still up).
 */

/** The open sheets, innermost last. Module-level: modality is a property of the document. */
const stack: symbol[] = [];
/** The page's own `overflow`, captured when the first sheet opened and restored when the last closes. */
let restoreOverflow: string | null = null;

/** Exported for tests only — a leaked entry would make every later sheet non-dismissable. */
export function openSheetCount(): number {
  return stack.length;
}

export function useModalSheet({ panelRef, onDismiss }: ModalSheetOptions): void {
  const dismissRef = useRef(onDismiss);
  // One identity per mounted sheet, stable across renders.
  const token = useRef<symbol>(undefined as unknown as symbol);
  token.current ??= Symbol('modal-sheet');
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  // Mount-only: focus in, page locked; unmount: page restored, focus back to the opener.
  useEffect(() => {
    const mine = token.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    stack.push(mine);
    const body = document.body;
    if (stack.length === 1) {
      restoreOverflow = body.style.overflow;
      body.style.overflow = 'hidden';
    }
    return () => {
      const index = stack.lastIndexOf(mine);
      if (index >= 0) stack.splice(index, 1);
      if (stack.length === 0) {
        body.style.overflow = restoreOverflow ?? '';
        restoreOverflow = null;
      }
      opener?.focus();
    };
    // `panelRef` is a stable ref object; re-running this would steal focus mid-interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Only the sheet on top of the stack reacts: otherwise one Escape would close a nested
      // confirmation *and* the sheet that opened it, and two focus traps would fight over Tab.
      if (stack[stack.length - 1] !== token.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissRef.current();
        return;
      }
      const node = panelRef.current;
      if (event.key !== 'Tab' || !node) return;
      const focusable = node.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

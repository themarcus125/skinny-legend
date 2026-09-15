import { useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import { MapPinGlyph } from '@/app/icons';

/**
 * The search param a location tap carries. It lives here rather than in `map.tsx` because this
 * button ships in the Trang chủ and member-detail chunks, and importing it from the map screen
 * would drag Leaflet into both of them.
 */
export const ENTRY_PARAM = 'entry';

/** Where a location tap lands, with the entry it should select. */
export function mapHref(entryId: string): string {
  return `/feed/map?${ENTRY_PARAM}=${encodeURIComponent(entryId)}`;
}

/**
 * The place name on a row, as the way into the map.
 *
 * The map used to be a toolbar button over the feed, which meant "where was this?" cost a trip
 * to a screen that then had to be hunted through. Tapping the *location itself* is the answer
 * to that question, so the place name is the control: it carries a real button role and an
 * `aria-label` that says what the tap does, rather than reading as bare text.
 *
 * An entry with no place has nothing to point at, so callers render plain text (or nothing) —
 * this component is only ever mounted for a row that has a `placeName`, and never degrades into
 * a disabled button, which would still be announced as a control.
 */
export function PlaceButton({
  entryId,
  placeName,
  testId,
}: {
  entryId: string;
  placeName: string;
  testId: string;
}) {
  const t = useTranslations();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      data-testid={testId}
      data-entry-id={entryId}
      aria-label={t('map.openPlace', { 0: placeName })}
      onClick={() => void navigate(mapHref(entryId))}
      className="type-caption text-foreground-secondary flex min-h-6 max-w-full items-center gap-1 rounded-sm text-left transition-opacity active:opacity-60"
    >
      <MapPinGlyph className="size-3.5 shrink-0" />
      <span className="truncate">{placeName}</span>
    </button>
  );
}

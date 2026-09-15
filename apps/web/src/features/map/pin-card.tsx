import { useLocale, useTranslations } from 'use-intl';
import type { MapPinDto } from '@skinny/shared/wire';
import { Avatar, CategoryChip, SurfaceCard } from '@skinny/ui';
import { MapPinGlyph } from '@/app/icons';
import { formatLocalDay } from '@/lib/local-day';

/** Avatar diameter on a pin card — `MapPinCard`'s 34. */
const CARD_AVATAR = 34;

/**
 * One pin's detail. Port of `MapPinCard` (ios/SkinnyLegend/Features/Map/MapPinCard.swift):
 * the same visual grammar as a feed row — photo, author, day, category chips, place name —
 * rebuilt as its own card because the feed's row is private to that screen there too.
 *
 * Coordinates are never rendered (spec §8 step 7): the marker's position on the map is the only
 * place a location is expressed, and the card says the *place name* instead.
 */
export function MapPinCard({ pin }: { pin: MapPinDto }) {
  const t = useTranslations();
  const locale = useLocale();
  return (
    <SurfaceCard as="article" padding="none" className="overflow-hidden">
      <div data-testid="pin-card" data-entry-id={pin.entryId}>
        {pin.thumbUrl ? (
          <img
            src={pin.thumbUrl}
            alt=""
            aria-hidden="true"
            className="bg-surface-2 aspect-video w-full object-cover"
          />
        ) : null}
        <div className="flex flex-col gap-2.5 p-4">
          <div className="flex items-center gap-2.5">
            <Avatar name={pin.user.displayName} src={pin.user.avatarUrl} size={CARD_AVATAR} />
            <div className="flex min-w-0 flex-col gap-px">
              <p data-testid="pin-name" className="type-h3 truncate font-heading">
                {pin.user.displayName}
              </p>
              <p data-testid="pin-day" className="type-caption text-foreground-secondary">
                {formatLocalDay(pin.localDate, locale)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {pin.categories.map((category) => (
              <CategoryChip key={category} category={category} label={t(`categories.${category}`)} />
            ))}
          </div>
          {pin.placeName ? (
            <p
              data-testid="pin-place"
              className="type-caption text-foreground-secondary flex items-center gap-1 truncate"
            >
              <MapPinGlyph className="size-3.5 shrink-0" />
              <span className="truncate">{pin.placeName}</span>
            </p>
          ) : null}
        </div>
      </div>
    </SurfaceCard>
  );
}

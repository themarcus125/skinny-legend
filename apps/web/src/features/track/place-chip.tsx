import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import type { PlaceSource } from '@skinny/shared/wire';
import { cn } from '@skinny/ui';
import { MapPinGlyph } from '@/app/icons';
import { useApi } from '@/lib/api';
import { queryKeys } from '@/lib/query';

export interface PlaceSelection {
  name: string | null;
  source: PlaceSource;
}

export interface PlaceChipProps {
  /** The fix from EXIF or `navigator.geolocation`; null when neither produced one. */
  lat: number | null;
  lng: number | null;
  value: PlaceSelection;
  onChange: (name: string | null, source: PlaceSource) => void;
}

/**
 * The place picker from `ios/SkinnyLegend/Features/Track/PlaceChip.swift`, over
 * `GET /places/nearby` instead of MapKit.
 *
 * The API answers with **at most one** name (Task 4's contract) and caches by grid cell, so the
 * distance it reports is cell-approximate — it is rendered with a "≈" rather than pretending to
 * metre precision. An empty list is the normal "nothing named around here"; `degraded: true`
 * means Nominatim itself failed. Both land on the same copy, because from the member's side
 * they are the same situation: type a name or leave it blank.
 *
 * A name picked from the list is `osm`; anything typed is `manual`; an empty field is `none`
 * (the state machine's `applyPlace` enforces that last one).
 */
export function PlaceChip({ lat, lng, value, onChange }: PlaceChipProps) {
  const t = useTranslations();
  const api = useApi();
  const hasFix = lat !== null && lng !== null;
  const [draft, setDraft] = useState(value.source === 'manual' ? (value.name ?? '') : '');

  const { data, isPending } = useQuery({
    queryKey: queryKeys.places(lat ?? 0, lng ?? 0),
    queryFn: () => api.nearbyPlaces(lat!, lng!),
    enabled: hasFix,
  });

  const places = data?.places ?? [];
  const nothingNearby = hasFix && !isPending && places.length === 0;

  return (
    <section
      data-testid="place-chip"
      aria-label={t('track.placeSheetLabel')}
      className="flex flex-col gap-2"
    >
      <p className="type-label text-foreground-subtle">{t('track.placesNearby')}</p>

      {hasFix && isPending ? (
        <p className="type-caption text-foreground-subtle">{t('track.findingPlaces')}</p>
      ) : null}

      {nothingNearby ? (
        <p data-testid="place-none" className="type-caption text-foreground-subtle">
          {t('track.noPlaces')}
        </p>
      ) : null}

      {places.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {places.map((place) => {
            const selected = value.source === 'osm' && value.name === place.name;
            return (
              <li key={`${place.name}:${place.lat},${place.lng}`}>
                <button
                  type="button"
                  data-testid="place-option"
                  aria-pressed={selected}
                  onClick={() => {
                    setDraft('');
                    onChange(selected ? null : place.name, 'osm');
                  }}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3',
                    selected
                      ? 'border-transparent bg-primary-soft text-primary'
                      : 'border-border bg-surface-2 text-foreground-secondary',
                  )}
                >
                  <MapPinGlyph className="size-3.5 shrink-0" />
                  <span className="type-caption truncate">{place.name}</span>
                  <span className="type-caption text-foreground-subtle tabular-nums">
                    {t('track.distanceApprox', { 0: Math.round(place.distanceM) })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="sr-only">{t('common.place')}</span>
        <input
          type="text"
          data-testid="place-manual"
          value={draft}
          maxLength={120}
          placeholder={t('common.place')}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            onChange(next.trim() === '' ? null : next.trim(), 'manual');
          }}
          className="type-body-medium border-border bg-card text-foreground h-11 w-full rounded-md border px-3 outline-ring"
        />
      </label>
    </section>
  );
}

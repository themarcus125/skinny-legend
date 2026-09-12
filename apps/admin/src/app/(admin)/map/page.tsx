'use client';

import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminApi } from '@/lib/auth/auth-context';

// Leaflet touches `window` at import time, so the map itself is client-only and never server-rendered.
const EntryMap = dynamic(() => import('@/components/map/entry-map'), { ssr: false });

const DAY_OPTIONS = [7, 30, 90] as const;

export default function MapPage() {
  const t = useTranslations('map');
  const api = useAdminApi();
  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(30);
  const dayItems: Record<string, string> = Object.fromEntries(
    DAY_OPTIONS.map((option) => [String(option), t(`days${option}`)]),
  );

  const mapQuery = useQuery({ queryKey: ['admin', 'map', days], queryFn: () => api.mapPins(days) });
  const pins = mapQuery.data ?? [];

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        action={
          <Select
            items={dayItems}
            value={String(days)}
            onValueChange={(value) => setDays(Number(value) as (typeof DAY_OPTIONS)[number])}
          >
            <SelectTrigger id="map-days" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {dayItems[String(option)]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <QueryState
        isPending={mapQuery.isPending}
        error={mapQuery.error}
        isEmpty={pins.length === 0}
        emptyLabel={t('empty')}
      >
        <EntryMap pins={pins} />
      </QueryState>
    </div>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminApi } from '@/lib/auth/auth-context';

// Leaflet touches `window` at import time, so the map itself is client-only and never server-rendered.
const EntryMap = dynamic(() => import('@/components/map/entry-map'), { ssr: false });

const DAY_OPTIONS = [7, 30, 90] as const;
const DAY_ITEMS: Record<string, string> = { '7': '7 ngày', '30': '30 ngày', '90': '90 ngày' };

export default function MapPage() {
  const api = useAdminApi();
  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(30);

  const mapQuery = useQuery({ queryKey: ['admin', 'map', days], queryFn: () => api.mapPins(days) });
  const pins = mapQuery.data ?? [];

  return (
    <div>
      <PageHeader
        title="Bản đồ"
        description="Địa điểm các mục ghi gần đây."
        action={
          <Select
            items={DAY_ITEMS}
            value={String(days)}
            onValueChange={(value) => setDays(Number(value) as (typeof DAY_OPTIONS)[number])}
          >
            <SelectTrigger id="map-days" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {DAY_ITEMS[String(option)]}
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
        emptyLabel="Chưa có mục ghi nào có địa điểm trong khoảng thời gian này."
      >
        <EntryMap pins={pins} />
      </QueryState>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CountPill, PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { EntriesFilters } from '@/components/entries/entries-filters';
import { EntriesTable } from '@/components/entries/entries-table';
import { OverrideDialog } from '@/components/entries/override-dialog';
import { EMPTY_FILTER_FORM, toEntryFilters, type FilterForm } from '@/components/entries/filters';
import { describeError } from '@/lib/api';
import type { AdminEntry, EntryPatch } from '@/lib/api/types';
import { useAdminApi } from '@/lib/auth/auth-context';

export default function EntriesPage() {
  const t = useTranslations('entries');
  const tRoot = useTranslations();
  const api = useAdminApi();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FilterForm>(EMPTY_FILTER_FORM);
  const [editing, setEditing] = useState<AdminEntry | null>(null);

  const filters = useMemo(() => toEntryFilters(form), [form]);

  const membersQuery = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.listUsers() });
  const entriesQuery = useQuery({
    queryKey: ['admin', 'entries', filters],
    queryFn: () => api.listEntries(filters),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'entries'] });
  }

  const patchEntry = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EntryPatch }) => api.patchEntry(id, patch),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
      toast.success(t('updated'));
    },
    onError: (error: Error) => toast.error(tRoot(describeError(error))),
  });

  const rejectEntry = useMutation({
    mutationFn: (id: string) => api.rejectEntry(id),
    onSuccess: async () => {
      await refresh();
      toast.success(t('rejected'));
    },
    onError: (error: Error) => toast.error(tRoot(describeError(error))),
  });

  const entries = entriesQuery.data ?? [];
  const isMutating = patchEntry.isPending || rejectEntry.isPending;

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={t('limitNote')}
        action={entriesQuery.data ? <CountPill>{t('count', { count: entries.length })}</CountPill> : null}
      />

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <div className="border-b border-border px-5 py-4">
          <EntriesFilters value={form} onChange={setForm} members={membersQuery.data ?? []} />
        </div>

        <QueryState
          isPending={entriesQuery.isPending}
          error={entriesQuery.error}
          isEmpty={entries.length === 0}
          emptyLabel={t('empty')}
        >
          <EntriesTable
            entries={entries}
            isMutating={isMutating}
            onOverride={setEditing}
            onReject={(entry) => rejectEntry.mutate(entry.id)}
          />
        </QueryState>
      </section>

      <OverrideDialog
        entry={editing}
        isSaving={patchEntry.isPending}
        onClose={() => setEditing(null)}
        onSave={(id, patch) => patchEntry.mutate({ id, patch })}
      />
    </div>
  );
}

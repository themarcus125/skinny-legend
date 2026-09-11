'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { QueryState } from '@/components/query-state';
import { EntriesFilters } from '@/components/entries/entries-filters';
import { EntriesTable } from '@/components/entries/entries-table';
import { OverrideDialog } from '@/components/entries/override-dialog';
import { EMPTY_FILTER_FORM, toEntryFilters, type FilterForm } from '@/components/entries/filters';
import { describeError } from '@/lib/api';
import type { AdminEntry, EntryPatch } from '@/lib/api/types';
import { useAdminApi } from '@/lib/auth/auth-context';

export default function EntriesPage() {
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
      toast.success('Đã cập nhật mục ghi');
    },
    onError: (error: Error) => toast.error(describeError(error)),
  });

  const rejectEntry = useMutation({
    mutationFn: (id: string) => api.rejectEntry(id),
    onSuccess: async () => {
      await refresh();
      toast.success('Đã từ chối mục ghi');
    },
    onError: (error: Error) => toast.error(describeError(error)),
  });

  const entries = entriesQuery.data ?? [];
  const isMutating = patchEntry.isPending || rejectEntry.isPending;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Mục ghi</h1>
        <p className="text-sm text-muted-foreground">
          API trả tối đa 200 mục mới nhất cho mỗi bộ lọc.
        </p>
      </header>

      <EntriesFilters value={form} onChange={setForm} members={membersQuery.data ?? []} />

      <QueryState
        isPending={entriesQuery.isPending}
        error={entriesQuery.error}
        isEmpty={entries.length === 0}
        emptyLabel="Không có mục ghi nào khớp bộ lọc."
      >
        <EntriesTable
          entries={entries}
          isMutating={isMutating}
          onOverride={setEditing}
          onReject={(entry) => rejectEntry.mutate(entry.id)}
        />
      </QueryState>

      <OverrideDialog
        entry={editing}
        isSaving={patchEntry.isPending}
        onClose={() => setEditing(null)}
        onSave={(id, patch) => patchEntry.mutate({ id, patch })}
      />
    </div>
  );
}

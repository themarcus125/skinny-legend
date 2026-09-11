import type { AdminEntry, EntryFilters, EntryStatus } from '@/lib/api/types';
import { formatPercent } from '@/lib/format';
import { CATEGORY_LABELS } from '@/lib/labels';

/** shadcn Select forbids an empty string value, so "no filter" is the sentinel 'all'. */
export const ALL = 'all';

export interface FilterForm {
  user: string;
  status: string;
  from: string;
  to: string;
}

export const EMPTY_FILTER_FORM: FilterForm = { user: ALL, status: ALL, from: '', to: '' };

export function toEntryFilters(form: FilterForm): EntryFilters {
  const filters: EntryFilters = {};
  if (form.user !== ALL) filters.user = form.user;
  if (form.status !== ALL) filters.status = form.status as EntryStatus;
  if (form.from) filters.from = form.from;
  if (form.to) filters.to = form.to;
  return filters;
}

/** One-line rendering of the stored ai_verdicts row for the table cell. */
export function verdictSummary(verdict: AdminEntry['verdict']): string {
  if (!verdict) return 'Không có';
  if (verdict.failed) return 'AI lỗi';
  // categories is a raw string[] from the model's JSON response, not the Category union, so an
  // unrecognized value (a model hallucination) falls back to itself rather than throwing.
  const labels: Record<string, string> = CATEGORY_LABELS;
  const categories = verdict.categories.length
    ? verdict.categories.map((category) => labels[category] ?? category).join(', ')
    : 'không có hạng mục';
  const healthy = verdict.healthy === null ? '' : verdict.healthy ? ' · lành mạnh' : ' · không lành mạnh';
  return `${categories} · ${formatPercent(verdict.confidence)}${healthy}`;
}

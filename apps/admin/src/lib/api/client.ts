import type {
  AdminEntry,
  AdminUser,
  EntryDto,
  EntryFilters,
  EntryPatch,
  FeedbackItem,
  RulesPayload,
  RulesResponse,
  UserPatch,
} from './types';

/** Mirrors the API error envelope `{ error: { code, message } }` (apps/api/src/errors.ts). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface AdminApi {
  session(): Promise<AdminUser>;
  listUsers(): Promise<AdminUser[]>;
  patchUser(id: string, patch: UserPatch): Promise<AdminUser>;
  listEntries(filters: EntryFilters): Promise<AdminEntry[]>;
  patchEntry(id: string, patch: EntryPatch): Promise<EntryDto>;
  rejectEntry(id: string): Promise<void>;
  getRules(): Promise<RulesResponse>;
  putRules(payload: RulesPayload): Promise<void>;
  listFeedback(): Promise<FeedbackItem[]>;
}

/** Serialises entry filters, dropping empty values. Returns '' or '?a=b&c=d'. */
export function buildQuery(filters: EntryFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

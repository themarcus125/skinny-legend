import { ApiError, buildQuery, type AdminApi } from './client';
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

/** Returns a Firebase ID token, or null when nobody is signed in. */
export type TokenProvider = () => Promise<string | null>;

export class LiveAdminApi implements AdminApi {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: TokenProvider,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getToken();
    if (!token) throw new ApiError(401, 'unauthenticated', 'Chưa đăng nhập');

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });

    if (response.status === 204) return undefined as T;

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const envelope = (body as { error?: { code?: string; message?: string } } | null)?.error;
      throw new ApiError(
        response.status,
        envelope?.code ?? 'unknown',
        envelope?.message ?? `Yêu cầu thất bại (${response.status})`,
      );
    }
    return body as T;
  }

  async session(): Promise<AdminUser> {
    const { user } = await this.request<{ user: AdminUser }>('/auth/session', { method: 'POST' });
    return user;
  }

  async listUsers(): Promise<AdminUser[]> {
    const { users } = await this.request<{ users: AdminUser[] }>('/admin/users');
    return users;
  }

  async patchUser(id: string, patch: UserPatch): Promise<AdminUser> {
    const { user } = await this.request<{ user: AdminUser }>(`/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return user;
  }

  async listEntries(filters: EntryFilters): Promise<AdminEntry[]> {
    const { entries } = await this.request<{ entries: AdminEntry[] }>(`/admin/entries${buildQuery(filters)}`);
    return entries;
  }

  async patchEntry(id: string, patch: EntryPatch): Promise<EntryDto> {
    const { entry } = await this.request<{ entry: EntryDto }>(`/admin/entries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return entry;
  }

  async rejectEntry(id: string): Promise<void> {
    await this.request<void>(`/admin/entries/${id}`, { method: 'DELETE' });
  }

  async getRules(): Promise<RulesResponse> {
    return this.request<RulesResponse>('/admin/rules');
  }

  async putRules(payload: RulesPayload): Promise<void> {
    await this.request<{ ok: true }>('/admin/rules', { method: 'PUT', body: JSON.stringify(payload) });
  }

  async listFeedback(): Promise<FeedbackItem[]> {
    const { feedback } = await this.request<{ feedback: FeedbackItem[] }>('/admin/feedback');
    return feedback;
  }
}

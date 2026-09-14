import type {
  CreateEntryInput,
  DashboardDto,
  DeviceDto,
  EntryDto,
  EntryMutationResponse,
  FeedResponse,
  HistoryResponse,
  LeaderboardRowDto,
  NearbyPlacesResponse,
  PatchEntryInput,
  PatchMeInput,
  PresignInput,
  PresignResponse,
  RegisterDeviceInput,
  TrendsResponse,
} from '@skinny/shared/wire';
import { ApiError } from './errors';
import type {
  AdminEntry,
  AdminUser,
  EntryFilters,
  EntryPatch,
  FeedbackInput,
  FeedbackItem,
  MapPin,
  NotificationLogItem,
  RulesPayload,
  RulesResponse,
  TestSendResult,
  UserPatch,
} from './types';

/** Returns a Firebase ID token, or null when nobody is signed in. */
export type TokenProvider = () => Promise<string | null>;

export interface ApiClientOptions {
  /** Origin of the API, no trailing slash. */
  baseUrl: string;
  getToken: TokenProvider;
  /** Injectable for tests; defaults to `globalThis.fetch`, resolved per call. */
  fetch?: typeof fetch;
  /**
   * Extra request headers, evaluated per call (ruling R17). The web app uses it only under
   * `import.meta.env.DEV` to send `x-test-uid`; production passes nothing.
   */
  headers?: () => Record<string, string>;
}

/**
 * The whole API surface — member routes and `/admin/*` alike — in one interface, so the iOS
 * app's web sibling and the admin console share a single implementation and a single mock.
 */
export interface ApiClient {
  // Auth & profile
  session(): Promise<AdminUser>;
  me(): Promise<AdminUser>;
  updateMe(patch: PatchMeInput): Promise<AdminUser>;

  // Read models
  dashboard(): Promise<DashboardDto>;
  leaderboard(): Promise<LeaderboardRowDto[]>;
  trends(): Promise<TrendsResponse>;
  feed(cursor?: string): Promise<FeedResponse>;
  myEntries(cursor?: string): Promise<HistoryResponse>;
  userEntries(userId: string, cursor?: string): Promise<HistoryResponse>;
  mapPins(days: number): Promise<MapPin[]>;

  // Entries & uploads
  presign(body: PresignInput): Promise<PresignResponse>;
  /**
   * PUTs the file to the presigned URL from `presign()`. Mirrors iOS `APIClient.upload`:
   * `onProgress` receives a 0…1 fraction and is always called with 1 on success. Rejects with
   * `ApiError(0, 'upload_failed', …)` on a non-2xx response or a network failure — status 0
   * because R2 answers the PUT directly and never speaks the API's error envelope.
   */
  uploadToPresign(
    url: string,
    file: Blob,
    contentType: string,
    onProgress?: (fraction: number) => void,
  ): Promise<void>;
  createEntry(body: CreateEntryInput): Promise<EntryMutationResponse>;
  /** `PATCH /entries/:id` — the member's confirm/correct call (ruling R3). */
  confirmEntry(id: string, body: PatchEntryInput): Promise<EntryMutationResponse>;
  deleteEntry(id: string): Promise<void>;
  nearbyPlaces(lat: number, lng: number): Promise<NearbyPlacesResponse>;
  sendFeedback(body: FeedbackInput): Promise<void>;

  // Push devices
  registerDevice(body: RegisterDeviceInput): Promise<DeviceDto>;
  unregisterDevice(token: string): Promise<void>;

  // Admin surface — unchanged in shape from apps/admin/src/lib/api/client.ts
  listUsers(): Promise<AdminUser[]>;
  patchUser(id: string, patch: UserPatch): Promise<AdminUser>;
  listEntries(filters: EntryFilters): Promise<AdminEntry[]>;
  /** `PATCH /admin/entries/:id` — the admin override (ruling R3). */
  patchEntry(id: string, patch: EntryPatch): Promise<EntryDto>;
  rejectEntry(id: string): Promise<void>;
  getRules(): Promise<RulesResponse>;
  putRules(payload: RulesPayload): Promise<void>;
  listFeedback(): Promise<FeedbackItem[]>;
  listNotifications(limit?: number): Promise<NotificationLogItem[]>;
  sendTestNotification(userId: string): Promise<TestSendResult>;
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

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const serialised = search.toString();
  return serialised ? `?${serialised}` : '';
}

/**
 * `fetch` against the API: bearer token, JSON envelope in, `ApiError` out. Generalised from
 * the admin's `LiveAdminApi`, whose behaviour it reproduces exactly.
 */
export class LiveApiClient implements ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.options.getToken();
    // Protocol text only: nothing renders ApiError.message (see describeError), so it stays English.
    if (!token) throw new ApiError(401, 'unauthenticated', 'Not signed in');

    // Resolved per call so a test that stubs globalThis.fetch after construction still wins.
    const doFetch = this.options.fetch ?? globalThis.fetch;
    const response = await doFetch(`${this.options.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...this.options.headers?.(),
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
        envelope?.message ?? `Request failed (${response.status})`,
      );
    }
    return body as T;
  }

  // MARK: Auth & profile

  async session(): Promise<AdminUser> {
    const { user } = await this.request<{ user: AdminUser }>('/auth/session', { method: 'POST' });
    return user;
  }

  async me(): Promise<AdminUser> {
    const { user } = await this.request<{ user: AdminUser }>('/me');
    return user;
  }

  async updateMe(patch: PatchMeInput): Promise<AdminUser> {
    const { user } = await this.request<{ user: AdminUser }>('/me', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return user;
  }

  // MARK: Read models

  dashboard(): Promise<DashboardDto> {
    return this.request<DashboardDto>('/me/dashboard');
  }

  async leaderboard(): Promise<LeaderboardRowDto[]> {
    const { leaderboard } = await this.request<{ leaderboard: LeaderboardRowDto[] }>('/leaderboard');
    return leaderboard;
  }

  trends(): Promise<TrendsResponse> {
    return this.request<TrendsResponse>('/me/trends');
  }

  feed(cursor?: string): Promise<FeedResponse> {
    return this.request<FeedResponse>(`/feed${query({ cursor })}`);
  }

  myEntries(cursor?: string): Promise<HistoryResponse> {
    return this.request<HistoryResponse>(`/entries/mine${query({ cursor })}`);
  }

  userEntries(userId: string, cursor?: string): Promise<HistoryResponse> {
    return this.request<HistoryResponse>(`/users/${userId}/entries${query({ cursor })}`);
  }

  async mapPins(days: number): Promise<MapPin[]> {
    const { pins } = await this.request<{ pins: MapPin[] }>(`/entries/map${query({ days })}`);
    return pins;
  }

  // MARK: Entries & uploads

  presign(body: PresignInput): Promise<PresignResponse> {
    return this.request<PresignResponse>('/uploads/presign', { method: 'POST', body: JSON.stringify(body) });
  }

  uploadToPresign(
    url: string,
    file: Blob,
    contentType: string,
    onProgress?: (fraction: number) => void,
  ): Promise<void> {
    // XMLHttpRequest, not fetch: it is still the only browser API that reports upload progress.
    return new Promise<void>((resolve, reject) => {
      const xhr = new globalThis.XMLHttpRequest();
      const fail = (message: string) => reject(new ApiError(0, 'upload_failed', message));
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', contentType);
      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (event: ProgressEvent) => {
          if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
        };
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(1);
          resolve();
        } else {
          fail(`Upload failed (${xhr.status})`);
        }
      };
      xhr.onerror = () => fail('Upload failed');
      xhr.onabort = () => fail('Upload aborted');
      xhr.send(file);
    });
  }

  createEntry(body: CreateEntryInput): Promise<EntryMutationResponse> {
    return this.request<EntryMutationResponse>('/entries', { method: 'POST', body: JSON.stringify(body) });
  }

  confirmEntry(id: string, body: PatchEntryInput): Promise<EntryMutationResponse> {
    return this.request<EntryMutationResponse>(`/entries/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  async deleteEntry(id: string): Promise<void> {
    await this.request<void>(`/entries/${id}`, { method: 'DELETE' });
  }

  nearbyPlaces(lat: number, lng: number): Promise<NearbyPlacesResponse> {
    return this.request<NearbyPlacesResponse>(`/places/nearby${query({ lat, lng })}`);
  }

  async sendFeedback(body: FeedbackInput): Promise<void> {
    await this.request<void>('/feedback', { method: 'POST', body: JSON.stringify(body) });
  }

  // MARK: Push devices

  async registerDevice(body: RegisterDeviceInput): Promise<DeviceDto> {
    const { device } = await this.request<{ device: DeviceDto }>('/me/devices', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return device;
  }

  async unregisterDevice(token: string): Promise<void> {
    await this.request<void>(`/me/devices/${encodeURIComponent(token)}`, { method: 'DELETE' });
  }

  // MARK: Admin

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

  getRules(): Promise<RulesResponse> {
    return this.request<RulesResponse>('/admin/rules');
  }

  async putRules(payload: RulesPayload): Promise<void> {
    await this.request<{ ok: true }>('/admin/rules', { method: 'PUT', body: JSON.stringify(payload) });
  }

  async listFeedback(): Promise<FeedbackItem[]> {
    const { feedback } = await this.request<{ feedback: FeedbackItem[] }>('/admin/feedback');
    return feedback;
  }

  async listNotifications(limit = 100): Promise<NotificationLogItem[]> {
    const { notifications } = await this.request<{ notifications: NotificationLogItem[] }>(
      `/admin/notifications${query({ limit })}`,
    );
    return notifications;
  }

  sendTestNotification(userId: string): Promise<TestSendResult> {
    return this.request<TestSendResult>('/admin/notifications/test', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  return new LiveApiClient(options);
}

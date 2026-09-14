import { addDays, isoWeekKey, toLocalDate, type LocalDate } from '@skinny/shared/dates';
import { computeScore, type ConfirmedEntry, type ScoreResult } from '@skinny/shared/scoring';
import { CATEGORIES } from '@skinny/shared/wire';
import type {
  Category,
  CreateEntryInput,
  DashboardDto,
  DeviceDto,
  EntryDto,
  EntryMutationResponse,
  FeedEntryDto,
  FeedResponse,
  HistoryEntryDto,
  HistoryResponse,
  LeaderboardRowDto,
  NearbyPlace,
  NearbyPlacesResponse,
  PatchEntryInput,
  PatchMeInput,
  PresignInput,
  PresignResponse,
  RegisterDeviceInput,
  TrendsResponse,
  UserSummaryDto,
  VerdictDto,
} from '@skinny/shared/wire';
import type { ApiClient } from '../client';
import { ApiError } from '../errors';
import type {
  AdminEntry,
  AdminUser,
  Challenge,
  EntryFilters,
  EntryPatch,
  FeedbackInput,
  FeedbackItem,
  MapPin,
  NotificationLogItem,
  RulesPayload,
  RulesResponse,
  ScoringRule,
  TestSendResult,
  UserPatch,
} from '../types';
import { CHALLENGE_TIMEZONE, makeSeed, svgImage, type Seed } from './seed';

export { makeSeed, svgImage, type Seed, type SeedPlace } from './seed';
export { makeAdminSeed } from './admin-seed';

/** Fake network latency so loading states are visible while developing against the mock. */
const DEFAULT_LATENCY_MS = 120;
const NEARBY_RADIUS_M = 300;
const NEARBY_LIMIT = 8;
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

export interface MockApiClientOptions {
  /** Defaults to `makeSeed()` — the member fixture. The admin console passes `makeAdminSeed()`. */
  seed?: Seed;
  latencyMs?: number;
  historyPageSize?: number;
  feedPageSize?: number;
}

interface Projection {
  projectedPoints: number;
  capsHit: Record<Category, boolean>;
  cappedCategories: Category[];
}

function toEntryDto(entry: AdminEntry): EntryDto {
  return {
    id: entry.id,
    userId: entry.userId,
    photoUrl: entry.photoUrl,
    thumbUrl: entry.thumbUrl,
    takenAt: entry.takenAt,
    localDate: entry.localDate,
    status: entry.status,
    categories: [...entry.categories],
    placeName: entry.placeName,
    placeSource: entry.placeSource,
    createdAt: entry.createdAt,
  };
}

function summary(user: AdminUser): UserSummaryDto {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarKey ? `mock://avatar/${user.avatarKey}` : null,
  };
}

/** Metres between two WGS84 points — the equirectangular approximation is plenty at 300 m. */
function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = Math.PI / 180;
  const x = (bLng - aLng) * toRad * Math.cos(((aLat + bLat) / 2) * toRad);
  const y = (bLat - aLat) * toRad;
  return Math.round(Math.sqrt(x * x + y * y) * 6_371_000);
}

/**
 * The whole `ApiClient` in memory. Scores come from `computeScore` in `@skinny/shared`, so the
 * leaderboard, dashboard, trends and every projection obey the real rulebook rather than
 * hand-written numbers. Mutations persist for the life of the instance; `reset()` undoes them.
 */
export class MockApiClient implements ApiClient {
  private readonly initial: Seed;
  private readonly latencyMs: number;
  private readonly historyPageSize: number;
  private readonly feedPageSize: number;

  private state: Seed;
  private devices = new Map<string, DeviceDto>();
  private counter = 0;

  /** Read-only view of the current fixture, for tests and dev tooling. */
  get seed(): Seed {
    return this.state;
  }

  constructor(options: MockApiClientOptions = {}) {
    this.initial = options.seed ?? makeSeed();
    this.latencyMs = options.latencyMs ?? DEFAULT_LATENCY_MS;
    this.historyPageSize = options.historyPageSize ?? 50;
    this.feedPageSize = options.feedPageSize ?? 30;
    this.state = structuredClone(this.initial);
  }

  /** Restores the fixture, discarding every mutation made since construction. */
  reset(): void {
    this.state = structuredClone(this.initial);
    this.devices = new Map();
    this.counter = 0;
  }

  private delay(): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, this.latencyMs));
  }

  // MARK: - Auth & profile

  async session(): Promise<AdminUser> {
    await this.delay();
    return { ...this.me_() };
  }

  async me(): Promise<AdminUser> {
    await this.delay();
    return { ...this.me_() };
  }

  async updateMe(patch: PatchMeInput): Promise<AdminUser> {
    await this.delay();
    const me = this.me_();
    if (patch.displayName !== undefined) me.displayName = patch.displayName;
    if (patch.avatarKey !== undefined) me.avatarKey = patch.avatarKey;
    if (patch.locale !== undefined) me.locale = patch.locale;
    this.state.me = me;
    return { ...me };
  }

  private me_(): AdminUser {
    return this.state.users.find((user) => user.id === this.state.me.id) ?? this.state.me;
  }

  // MARK: - Scoring

  private challengeConfig(): Challenge {
    return this.state.challenge;
  }

  private scoringInputs(userId: string, exclude?: string): ConfirmedEntry[] {
    return this.state.entries
      .filter((entry) => entry.userId === userId && entry.status === 'confirmed' && entry.id !== exclude)
      .map((entry) => ({
        id: entry.id,
        localDate: entry.localDate,
        takenAt: new Date(entry.takenAt),
        categories: [...entry.categories],
      }));
  }

  private score(userId: string, entries = this.scoringInputs(userId), asOf = this.state.today): ScoreResult {
    const challenge = this.challengeConfig();
    return computeScore({
      entries,
      rules: this.state.rules,
      challenge: {
        startDate: challenge.startDate,
        endDate: challenge.endDate,
        timezone: challenge.timezone,
        streakPoints: challenge.streakPoints,
        streakLength: challenge.streakLength,
      },
      asOf,
    });
  }

  /**
   * Leaderboard order: points desc, then display name. Rank is positional (1…n) rather than
   * competition ranking, so a table of tied members still reads 1, 2, 3 — the iOS mock's
   * `1 + count(greater)` would print 1, 1, 1 for the seeded five.
   */
  private scoreboard(): Array<{ user: AdminUser; score: ScoreResult; rank: number }> {
    return this.state.users
      .map((user) => ({ user, score: this.score(user.id), rank: 0 }))
      .sort((left, right) =>
        left.score.total !== right.score.total
          ? right.score.total - left.score.total
          : left.user.displayName.localeCompare(right.user.displayName),
      )
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }

  /**
   * Points this entry would earn if confirmed with `categories`, plus caps for its own day/week,
   * plus which of its own categories scored 0 because their cap was already full.
   */
  private project(entryId: string, categories: Category[], day: LocalDate, takenAt: string): Projection {
    const meId = this.state.me.id;
    const inputs = this.scoringInputs(meId, entryId);
    inputs.push({ id: entryId, localDate: day, takenAt: new Date(takenAt), categories: [...categories] });
    const asOf = day > this.state.today ? day : this.state.today;
    const result = this.score(meId, inputs, asOf);

    const own = result.scored.filter((row) => row.entryId === entryId);
    const dayByEntry = new Map(inputs.map((entry) => [entry.id, entry.localDate]));
    const capsHit = {} as Record<Category, boolean>;
    for (const category of CATEGORIES) capsHit[category] = false;
    for (const rule of this.state.rules) {
      const target = rule.capPeriod === 'day' ? day : isoWeekKey(day);
      const count = result.scored.filter((row) => {
        if (row.category !== rule.category || row.points === 0) return false;
        const entryDay = dayByEntry.get(row.entryId);
        if (!entryDay) return false;
        return (rule.capPeriod === 'day' ? entryDay : isoWeekKey(entryDay)) === target;
      }).length;
      capsHit[rule.category] = count >= rule.capCount;
    }

    return {
      projectedPoints: own.reduce((sum, row) => sum + row.points, 0),
      capsHit,
      cappedCategories: own.filter((row) => row.capped).map((row) => row.category),
    };
  }

  // MARK: - Read models

  async dashboard(): Promise<DashboardDto> {
    await this.delay();
    const board = this.scoreboard();
    const mine = board.find((row) => row.user.id === this.state.me.id);
    if (!mine) throw new ApiError(404, 'not_found', 'Member not found');
    const today = this.state.today;
    const todayScore = mine.score.byDay[today] ?? { points: 0, categories: [] };
    const yesterdayScore = mine.score.byDay[addDays(today, -1)] ?? { points: 0, categories: [] };
    return {
      today: { points: todayScore.points, categories: [...todayScore.categories] },
      yesterday: { points: yesterdayScore.points },
      deltaVsYesterday: todayScore.points - yesterdayScore.points,
      streak: mine.score.streak,
      total: mine.score.total,
      rank: mine.rank,
      memberCount: board.length,
      capsHit: mine.score.capsHit,
      remaining: CATEGORIES.filter((category) => !mine.score.capsHit[category]),
    };
  }

  async leaderboard(): Promise<LeaderboardRowDto[]> {
    await this.delay();
    const week = isoWeekKey(this.state.today);
    return this.scoreboard().map((row) => ({
      rank: row.rank,
      user: summary(row.user),
      total: row.score.total,
      weekPoints: weekPoints(row.score, week),
      isMe: row.user.id === this.state.me.id,
    }));
  }

  async trends(): Promise<TrendsResponse> {
    await this.delay();
    const board = this.scoreboard();
    const mine = board.find((row) => row.user.id === this.state.me.id);
    if (!mine) throw new ApiError(404, 'not_found', 'Member not found');

    const keys: string[] = [];
    for (let cursor = this.state.challenge.startDate; cursor <= this.state.today; cursor = addDays(cursor, 7)) {
      const key = isoWeekKey(cursor);
      if (!keys.includes(key)) keys.push(key);
    }
    const currentWeek = isoWeekKey(this.state.today);
    if (!keys.includes(currentWeek)) keys.push(currentWeek);

    const weeks = keys.slice(-8).map((week) => {
      const perUser = board.map((row) => weekPoints(row.score, week));
      const points = weekPoints(mine.score, week);
      const average = perUser.length === 0 ? 0 : perUser.reduce((a, b) => a + b, 0) / perUser.length;
      return {
        week,
        mine: points,
        groupAvg: average,
        rank: 1 + perUser.filter((value) => value > points).length,
      };
    });

    const heatmap = Object.entries(mine.score.byDay)
      .map(([date, day]) => ({ date, points: day.points }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { weeks, heatmap, byCategory: mine.score.byCategory, streakBonus: mine.score.streakBonus };
  }

  async feed(cursor?: string): Promise<FeedResponse> {
    await this.delay();
    const visible = this.state.entries
      .filter((entry) => entry.status === 'confirmed')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const page = paginate(visible, cursor, this.feedPageSize, 'createdAt');
    const entries = page.items.flatMap<FeedEntryDto>((entry) => {
      const author = this.state.users.find((user) => user.id === entry.userId);
      return author ? [{ ...toEntryDto(entry), user: summary(author) }] : [];
    });
    return { entries, nextCursor: page.nextCursor };
  }

  async myEntries(cursor?: string): Promise<HistoryResponse> {
    await this.delay();
    return this.historyFor(this.state.me.id, cursor, (entry) => entry.status !== 'rejected');
  }

  async userEntries(userId: string, cursor?: string): Promise<HistoryResponse> {
    await this.delay();
    return this.historyFor(userId, cursor, (entry) => entry.status === 'confirmed');
  }

  private historyFor(
    userId: string,
    cursor: string | undefined,
    keep: (entry: AdminEntry) => boolean,
  ): HistoryResponse {
    const score = this.score(userId);
    const visible = this.state.entries
      .filter((entry) => entry.userId === userId && keep(entry))
      .sort((a, b) => b.takenAt.localeCompare(a.takenAt));
    const page = paginate(visible, cursor, this.historyPageSize, 'takenAt');
    const entries = page.items.map<HistoryEntryDto>((entry) => {
      const scored = score.scored.filter((row) => row.entryId === entry.id);
      return {
        ...toEntryDto(entry),
        points: scored.reduce((sum, row) => sum + row.points, 0),
        capped: scored.some((row) => row.capped),
      };
    });
    return { entries, nextCursor: page.nextCursor };
  }

  async mapPins(days: number): Promise<MapPin[]> {
    await this.delay();
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return this.state.entries
      .filter(
        (entry) =>
          entry.status === 'confirmed' &&
          entry.lat !== null &&
          entry.lng !== null &&
          new Date(entry.takenAt).getTime() >= since,
      )
      .map((entry) => ({
        entryId: entry.id,
        lat: entry.lat!,
        lng: entry.lng!,
        placeName: entry.placeName,
        takenAt: entry.takenAt,
        localDate: entry.localDate,
        categories: [...entry.categories],
        thumbUrl: entry.thumbUrl,
        user: { id: entry.user.id, displayName: entry.user.displayName, avatarUrl: null },
      }))
      .sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1));
  }

  // MARK: - Entries & uploads

  async presign(body: PresignInput): Promise<PresignResponse> {
    await this.delay();
    this.counter += 1;
    const key = `${body.kind}s/${this.state.me.id}/mock-${this.counter}.jpg`;
    return { key, url: `mock://upload/${key}`, expiresAt: new Date(Date.now() + 300_000).toISOString() };
  }

  async createEntry(body: CreateEntryInput): Promise<EntryMutationResponse> {
    await this.delay();
    this.counter += 1;
    // A deterministic pretend verdict, mirroring MockAPIClient.swift: every fifth id is the
    // failing fixture (the vision call came back unusable), the rest alternate between a meal
    // and a group workout. A usable verdict confirms the entry outright with the suggested
    // categories; a failed one leaves it pending with none, for the member to pick by hand.
    const failed = this.counter % 5 === 0;
    const suggested: Category[] = failed ? [] : this.counter % 3 === 0 ? ['meal'] : ['exercise', 'group'];
    const localDate = toLocalDate(new Date(body.takenAt), CHALLENGE_TIMEZONE);
    const hue = (this.counter * 37) % 360;
    const me = this.me_();
    const photo = svgImage(`#${this.counter}`, hue);
    const entry: AdminEntry = {
      id: `bbbbbbbb-0000-4000-8000-${String(this.counter).padStart(12, '0')}`,
      userId: me.id,
      photoUrl: photo,
      thumbUrl: photo,
      takenAt: body.takenAt,
      localDate,
      status: failed ? 'pending' : 'confirmed',
      categories: [...suggested],
      placeName: body.placeName ?? null,
      placeSource: body.placeSource ?? (body.placeName ? 'manual' : 'none'),
      createdAt: new Date().toISOString(),
      user: { id: me.id, displayName: me.displayName },
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      verdict: {
        categories: [...suggested],
        healthy: suggested.includes('meal') ? true : null,
        confidence: failed ? 0 : 0.84,
        reason: failed
          ? ''
          : suggested.includes('meal')
            ? 'Bữa ăn nhiều rau và protein nạc.'
            : 'Ảnh chụp tại nơi tập luyện với hai người.',
        model: 'mock/offline',
        failed,
      },
    };
    this.state.entries.unshift(entry);

    const verdict: VerdictDto = {
      categories: [...suggested],
      healthy: entry.verdict!.healthy,
      confidence: entry.verdict!.confidence!,
      reason: entry.verdict!.reason!,
      model: entry.verdict!.model,
      failed,
    };
    return { entry: toEntryDto(entry), verdict, ...this.project(entry.id, suggested, localDate, entry.takenAt) };
  }

  async confirmEntry(id: string, body: PatchEntryInput): Promise<EntryMutationResponse> {
    await this.delay();
    const entry = this.state.entries.find(
      (row) => row.id === id && row.userId === this.state.me.id && row.status !== 'rejected',
    );
    if (!entry) throw new ApiError(404, 'not_found', 'Entry not found');
    entry.categories = [...new Set(body.categories)];
    entry.status = 'confirmed';
    if (body.placeName !== undefined) entry.placeName = body.placeName;
    if (body.placeSource !== undefined) entry.placeSource = body.placeSource;
    return {
      entry: toEntryDto(entry),
      ...this.project(entry.id, entry.categories, entry.localDate, entry.takenAt),
    };
  }

  async deleteEntry(id: string): Promise<void> {
    await this.delay();
    const entry = this.state.entries.find((row) => row.id === id && row.userId === this.state.me.id);
    if (!entry) throw new ApiError(404, 'not_found', 'Entry not found');
    entry.status = 'rejected';
  }

  async nearbyPlaces(lat: number, lng: number): Promise<NearbyPlacesResponse> {
    await this.delay();
    const places = this.state.places
      .map<NearbyPlace>((place) => ({
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        distanceM: distanceM(lat, lng, place.lat, place.lng),
        source: 'osm',
      }))
      .filter((place) => place.distanceM <= NEARBY_RADIUS_M)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, NEARBY_LIMIT);
    return { places, attribution: OSM_ATTRIBUTION };
  }

  async sendFeedback(body: FeedbackInput): Promise<void> {
    await this.delay();
    this.state.feedback.unshift({
      id: `f-mock-${this.state.feedback.length + 1}`,
      userId: this.state.me.id,
      message: body.message,
      screenshotKey: body.screenshotKey ?? null,
      appVersion: body.appVersion ?? null,
      createdAt: new Date().toISOString(),
      screenshotUrl: null,
      user: { id: this.state.me.id, displayName: this.me_().displayName },
    });
  }

  // MARK: - Push devices

  async registerDevice(body: RegisterDeviceInput): Promise<DeviceDto> {
    await this.delay();
    const device: DeviceDto = {
      id: `device-${this.devices.size + 1}`,
      userId: this.state.me.id,
      token: body.token,
      platform: body.platform,
      locale: body.locale,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
    this.devices.set(body.token, device);
    return device;
  }

  async unregisterDevice(token: string): Promise<void> {
    await this.delay();
    this.devices.delete(token);
  }

  /** Test-only view of what the app registered. Sorted so assertions are order-independent. */
  registeredTokens(): string[] {
    return [...this.devices.keys()].sort();
  }

  // MARK: - Admin surface

  async listUsers(): Promise<AdminUser[]> {
    await this.delay();
    return this.state.users.map((user) => ({ ...user }));
  }

  async patchUser(id: string, patch: UserPatch): Promise<AdminUser> {
    await this.delay();
    const user = this.state.users.find((row) => row.id === id);
    if (!user) throw new ApiError(404, 'not_found', 'User not found');
    Object.assign(user, patch);
    return { ...user };
  }

  async listEntries(filters: EntryFilters): Promise<AdminEntry[]> {
    await this.delay();
    return this.state.entries
      .filter(
        (entry) =>
          (!filters.user || entry.userId === filters.user) &&
          (!filters.status || entry.status === filters.status) &&
          (!filters.from || entry.localDate >= filters.from) &&
          (!filters.to || entry.localDate <= filters.to),
      )
      .map((entry) => ({ ...entry, categories: [...entry.categories] }));
  }

  async patchEntry(id: string, patch: EntryPatch): Promise<EntryDto> {
    await this.delay();
    const entry = this.state.entries.find((row) => row.id === id);
    if (!entry) throw new ApiError(404, 'not_found', 'Entry not found');
    if (patch.categories) entry.categories = [...new Set(patch.categories)];
    if (patch.status) entry.status = patch.status;
    return toEntryDto(entry);
  }

  async rejectEntry(id: string): Promise<void> {
    await this.delay();
    const entry = this.state.entries.find((row) => row.id === id);
    if (!entry) throw new ApiError(404, 'not_found', 'Entry not found');
    entry.status = 'rejected';
  }

  async getRules(): Promise<RulesResponse> {
    await this.delay();
    return {
      challenge: { ...this.state.challenge },
      rules: this.state.rules.map((rule) => ({ ...rule })),
    };
  }

  async putRules(payload: RulesPayload): Promise<void> {
    await this.delay();
    this.state.challenge = { ...this.state.challenge, ...payload.challenge };
    this.state.rules = payload.rules.map<ScoringRule>((rule, index) => ({
      id: `r-${index + 1}`,
      challengeId: this.state.challenge.id,
      ...rule,
    }));
  }

  async listFeedback(): Promise<FeedbackItem[]> {
    await this.delay();
    return this.state.feedback.map((item) => ({ ...item }));
  }

  async listNotifications(limit = 100): Promise<NotificationLogItem[]> {
    await this.delay();
    return this.state.notifications
      .slice()
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
      .slice(0, limit)
      .map((item) => ({ ...item }));
  }

  async sendTestNotification(userId: string): Promise<TestSendResult> {
    await this.delay();
    const user = this.state.users.find((row) => row.id === userId);
    if (!user) throw new ApiError(404, 'not_found', 'User not found');
    // Only the seeded active members have a "device" in mock mode, so the empty-device error
    // path is reachable from the UI without any setup.
    if (user.status !== 'active') throw new ApiError(400, 'no_device_tokens', 'User has no registered devices');
    return { sent: 1, tokens: 1, removedTokens: 0 };
  }
}

function weekPoints(score: ScoreResult, week: string): number {
  return Object.entries(score.byDay)
    .filter(([date]) => isoWeekKey(date) === week)
    .reduce((sum, [, day]) => sum + day.points, 0);
}

function paginate<T, K extends keyof T & string>(
  items: T[],
  cursor: string | undefined,
  size: number,
  key: K,
): { items: T[]; nextCursor: string | null } {
  const bound = cursor ? Date.parse(cursor) : NaN;
  const remaining = Number.isNaN(bound)
    ? items
    : items.filter((item) => Date.parse(String(item[key])) < bound);
  const page = remaining.slice(0, size);
  const last = page[page.length - 1];
  const nextCursor =
    page.length === size && last ? new Date(Date.parse(String(last[key]))).toISOString() : null;
  return { items: page, nextCursor };
}

export function createMockApiClient(options: MockApiClientOptions = {}): MockApiClient {
  return new MockApiClient(options);
}

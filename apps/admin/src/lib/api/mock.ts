import { ApiError, type AdminApi } from './client';
import type {
  AdminEntry,
  AdminUser,
  Category,
  Challenge,
  EntryDto,
  EntryFilters,
  EntryPatch,
  EntryStatus,
  FeedbackItem,
  MapPin,
  RulesPayload,
  RulesResponse,
  ScoringRule,
  UserPatch,
} from './types';

/** Fake network latency so loading states are visible while developing against the mock. */
const LATENCY_MS = 120;
const delay = () => new Promise<void>((resolve) => setTimeout(resolve, LATENCY_MS));

/** Inline SVG stand-ins for R2 photos: no network, no CSP surprises. */
function svgImage(label: string, hue: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">` +
    `<rect width="96" height="96" rx="8" fill="hsl(${hue} 70% 86%)"/>` +
    `<text x="48" y="53" font-family="sans-serif" font-size="13" text-anchor="middle" fill="hsl(${hue} 45% 25%)">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function addDays(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const CHALLENGE_START = '2026-09-08';

/** Fixed HCMC coordinates for seeded places — same table as the iOS mock (task-4-brief.md). */
const PLACE_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'California Fitness Q1': { lat: 10.7769, lng: 106.7009 },
  'Công viên Gia Định': { lat: 10.8122, lng: 106.674 },
  'Sân cầu lông Tân Bình': { lat: 10.801, lng: 106.652 },
  'Hồ bơi Lam Sơn': { lat: 10.783, lng: 106.695 },
  'Bún chả Hương Liên': { lat: 10.774, lng: 106.703 },
  'Cơm tấm Ba Ghiền': { lat: 10.789, lng: 106.691 },
};
const PLACE_NAMES = Object.keys(PLACE_COORDINATES);

const SEED_USERS: AdminUser[] = [
  { id: '11111111-1111-4111-8111-111111111111', firebaseUid: 'uid-khoa', displayName: 'Khoa', avatarKey: null, role: 'admin', status: 'active', createdAt: '2026-09-08T01:00:00.000Z' },
  { id: '22222222-2222-4222-8222-222222222222', firebaseUid: 'uid-minh', displayName: 'Minh', avatarKey: null, role: 'member', status: 'active', createdAt: '2026-09-08T02:30:00.000Z' },
  { id: '33333333-3333-4333-8333-333333333333', firebaseUid: 'uid-lan', displayName: 'Lan', avatarKey: null, role: 'member', status: 'active', createdAt: '2026-09-09T04:15:00.000Z' },
  { id: '44444444-4444-4444-8444-444444444444', firebaseUid: 'uid-tuan', displayName: 'Tuấn', avatarKey: null, role: 'member', status: 'pending', createdAt: '2026-09-10T03:05:00.000Z' },
];

interface EntryPattern {
  categories: Category[];
  status: EntryStatus;
  healthy: boolean | null;
  confidence: number;
  reason: string;
}

const ENTRY_PATTERNS: EntryPattern[] = [
  { categories: ['exercise'], status: 'confirmed', healthy: null, confidence: 0.91, reason: 'Ảnh chụp trong phòng gym với tạ đòn.' },
  { categories: ['meal'], status: 'confirmed', healthy: true, confidence: 0.78, reason: 'Đĩa salad và ức gà nướng.' },
  { categories: ['exercise', 'group'], status: 'confirmed', healthy: null, confidence: 0.84, reason: 'Hai người chạy bộ cùng nhau ngoài công viên.' },
  { categories: [], status: 'pending', healthy: false, confidence: 0.42, reason: 'Ảnh mì cay nhiều dầu mỡ, không tính bữa lành mạnh.' },
  { categories: ['group'], status: 'rejected', healthy: null, confidence: 0.31, reason: 'Không rõ hoạt động trong ảnh.' },
];

function seedEntries(): AdminEntry[] {
  const members = SEED_USERS.filter((user) => user.status === 'active');
  const entries: AdminEntry[] = [];
  for (let i = 0; i < 30; i += 1) {
    const member = members[i % members.length]!;
    const pattern = ENTRY_PATTERNS[i % ENTRY_PATTERNS.length]!;
    const localDate = addDays(CHALLENGE_START, Math.floor(i / members.length));
    const takenAt = `${localDate}T${String(6 + (i % 12)).padStart(2, '0')}:30:00+07:00`;
    const hue = (i * 37) % 360;
    const hasPlace = i % 3 === 0;
    const placeName = hasPlace ? PLACE_NAMES[Math.floor(i / 3) % PLACE_NAMES.length]! : null;
    const coords = placeName ? PLACE_COORDINATES[placeName]! : null;
    entries.push({
      id: `e-${String(i + 1).padStart(2, '0')}`,
      userId: member.id,
      photoUrl: svgImage(`#${i + 1}`, hue),
      thumbUrl: svgImage(`#${i + 1}`, hue),
      takenAt,
      localDate,
      status: pattern.status,
      categories: [...pattern.categories],
      placeName,
      placeSource: hasPlace ? 'poi' : 'none',
      createdAt: takenAt,
      user: { id: member.id, displayName: member.displayName },
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      // Every 7th entry has no verdict row, mirroring an entry created before the vision call landed.
      verdict:
        i % 7 === 6
          ? null
          : {
              categories: [...pattern.categories],
              healthy: pattern.healthy,
              confidence: pattern.confidence,
              reason: pattern.reason,
              model: 'qwen/qwen3.7-flash',
              failed: false,
            },
    });
  }
  // The API orders by created_at DESC.
  return entries.reverse();
}

const SEED_CHALLENGE: Challenge = {
  id: 'c-00000000-0000-4000-8000-000000000001',
  name: 'Operation Skinny Legend',
  startDate: CHALLENGE_START,
  endDate: '2026-12-25',
  timezone: 'Asia/Ho_Chi_Minh',
  streakPoints: 5,
  streakLength: 7,
};

const SEED_RULES: ScoringRule[] = [
  { id: 'r-1', challengeId: SEED_CHALLENGE.id, category: 'exercise', points: 3, capCount: 1, capPeriod: 'day' },
  { id: 'r-2', challengeId: SEED_CHALLENGE.id, category: 'meal', points: 2, capCount: 1, capPeriod: 'day' },
  { id: 'r-3', challengeId: SEED_CHALLENGE.id, category: 'group', points: 3, capCount: 2, capPeriod: 'week' },
];

const SEED_FEEDBACK: FeedbackItem[] = [
  {
    id: 'f-1',
    userId: SEED_USERS[1]!.id,
    message: 'Nút "Không đúng?" hơi khó thấy trên iPhone mini, mình bấm nhầm Xác nhận hai lần.',
    screenshotKey: 'feedback/uid-minh/shot-1.jpg',
    appVersion: '1.0 (12)',
    createdAt: '2026-09-10T12:20:00.000Z',
    screenshotUrl: svgImage('SS', 210),
    user: { id: SEED_USERS[1]!.id, displayName: SEED_USERS[1]!.displayName },
  },
  {
    id: 'f-2',
    userId: SEED_USERS[2]!.id,
    message: 'Cho mình xin thêm bộ lọc theo tuần ở Trends nhé.',
    screenshotKey: null,
    appVersion: '1.0 (11)',
    createdAt: '2026-09-09T02:40:00.000Z',
    screenshotUrl: null,
    user: { id: SEED_USERS[2]!.id, displayName: SEED_USERS[2]!.displayName },
  },
];

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

/** In-memory AdminApi for local UI work. Mutations persist for the life of the instance. */
export class MockAdminApi implements AdminApi {
  private users: AdminUser[] = SEED_USERS.map((user) => ({ ...user }));
  private entries: AdminEntry[] = seedEntries();
  private challenge: Challenge = { ...SEED_CHALLENGE };
  private rules: ScoringRule[] = SEED_RULES.map((rule) => ({ ...rule }));
  private feedback: FeedbackItem[] = SEED_FEEDBACK.map((item) => ({ ...item }));

  async session(): Promise<AdminUser> {
    await delay();
    return { ...this.users[0]! };
  }

  async listUsers(): Promise<AdminUser[]> {
    await delay();
    return this.users.map((user) => ({ ...user }));
  }

  async patchUser(id: string, patch: UserPatch): Promise<AdminUser> {
    await delay();
    const user = this.users.find((row) => row.id === id);
    if (!user) throw new ApiError(404, 'not_found', 'User not found');
    Object.assign(user, patch);
    return { ...user };
  }

  async listEntries(filters: EntryFilters): Promise<AdminEntry[]> {
    await delay();
    return this.entries
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
    await delay();
    const entry = this.entries.find((row) => row.id === id);
    if (!entry) throw new ApiError(404, 'not_found', 'Entry not found');
    if (patch.categories) entry.categories = [...new Set(patch.categories)];
    if (patch.status) entry.status = patch.status;
    return toEntryDto(entry);
  }

  async rejectEntry(id: string): Promise<void> {
    await delay();
    const entry = this.entries.find((row) => row.id === id);
    if (!entry) throw new ApiError(404, 'not_found', 'Entry not found');
    entry.status = 'rejected';
  }

  async getRules(): Promise<RulesResponse> {
    await delay();
    return { challenge: { ...this.challenge }, rules: this.rules.map((rule) => ({ ...rule })) };
  }

  async putRules(payload: RulesPayload): Promise<void> {
    await delay();
    this.challenge = { ...this.challenge, ...payload.challenge };
    this.rules = payload.rules.map((rule, index) => ({
      id: `r-${index + 1}`,
      challengeId: this.challenge.id,
      ...rule,
    }));
  }

  async listFeedback(): Promise<FeedbackItem[]> {
    await delay();
    return this.feedback.map((item) => ({ ...item }));
  }

  async mapPins(days: number): Promise<MapPin[]> {
    await delay();
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return this.entries
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
}

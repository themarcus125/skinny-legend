import { addDays, type LocalDate } from '@skinny/shared/dates';
import type { Category, EntryStatus } from '@skinny/shared/wire';
import type { AdminEntry, AdminUser, FeedbackItem, NotificationLogItem } from '../types';
import {
  CHALLENGE_START,
  defaultChallenge,
  defaultRules,
  svgImage,
  todayLocal,
  type Seed,
  type SeedPlace,
} from './seed';

/**
 * The admin console's fixture, moved verbatim from `apps/admin/src/lib/api/mock.ts`
 * (ruling R5): four members with one pending, thirty entries newest-first with exactly one
 * failed verdict, the three rulebook rows, two feedback rows and three notification rows.
 * The admin's mock tests assert these numbers, so nothing here may drift.
 */

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
  { id: '11111111-1111-4111-8111-111111111111', firebaseUid: 'uid-khoa', displayName: 'Khoa', avatarKey: null, role: 'admin', status: 'active', locale: 'vi', createdAt: '2026-09-08T01:00:00.000Z' },
  { id: '22222222-2222-4222-8222-222222222222', firebaseUid: 'uid-minh', displayName: 'Minh', avatarKey: null, role: 'member', status: 'active', locale: 'vi', createdAt: '2026-09-08T02:30:00.000Z' },
  { id: '33333333-3333-4333-8333-333333333333', firebaseUid: 'uid-lan', displayName: 'Lan', avatarKey: null, role: 'member', status: 'active', locale: 'vi', createdAt: '2026-09-09T04:15:00.000Z' },
  { id: '44444444-4444-4444-8444-444444444444', firebaseUid: 'uid-tuan', displayName: 'Tuấn', avatarKey: null, role: 'member', status: 'pending', locale: 'vi', createdAt: '2026-09-10T03:05:00.000Z' },
];

interface EntryPattern {
  categories: Category[];
  status: EntryStatus;
  healthy: boolean | null;
  confidence: number;
  reason: string;
}

/**
 * Entries are confirmed straight from the AI verdict, so the only pending entry is the one whose
 * verdict failed and that the member never categorised by hand. Index 26 avoids the no-verdict slots.
 */
const FAILED_VERDICT_INDEX = 26;

const ENTRY_PATTERNS: EntryPattern[] = [
  { categories: ['exercise'], status: 'confirmed', healthy: null, confidence: 0.91, reason: 'Ảnh chụp trong phòng gym với tạ đòn.' },
  { categories: ['meal'], status: 'confirmed', healthy: true, confidence: 0.78, reason: 'Đĩa salad và ức gà nướng.' },
  { categories: ['exercise', 'group'], status: 'confirmed', healthy: null, confidence: 0.84, reason: 'Hai người chạy bộ cùng nhau ngoài công viên.' },
  // An unhealthy meal is auto-confirmed with no categories (the AI drops `meal`); it scores nothing unless the member opts in.
  { categories: [], status: 'confirmed', healthy: false, confidence: 0.42, reason: 'Ảnh mì cay nhiều dầu mỡ, không tính bữa lành mạnh.' },
  { categories: ['group'], status: 'rejected', healthy: null, confidence: 0.31, reason: 'Không rõ hoạt động trong ảnh.' },
];

function seedEntries(): AdminEntry[] {
  const members = SEED_USERS.filter((user) => user.status === 'active');
  const entries: AdminEntry[] = [];
  for (let i = 0; i < 30; i += 1) {
    const member = members[i % members.length]!;
    const pattern: EntryPattern =
      i === FAILED_VERDICT_INDEX
        ? { categories: [], status: 'pending', healthy: null, confidence: 0, reason: '' }
        : ENTRY_PATTERNS[i % ENTRY_PATTERNS.length]!;
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
              failed: i === FAILED_VERDICT_INDEX,
            },
    });
  }
  // The API orders by created_at DESC.
  return entries.reverse();
}

function seedFeedback(): FeedbackItem[] {
  return [
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
}

function seedNotifications(): NotificationLogItem[] {
  return [
    {
      id: 'n-1',
      kind: 'rank_nudge',
      payload: { title: 'Bạn đang bám sát Khoa', body: 'Còn 6 điểm là vượt Khoa.', locale: 'vi', vars: { gap: 6, name: 'Khoa' } },
      sentAt: `${addDays(CHALLENGE_START, 11)}T13:00:00.000Z`,
      user: { id: SEED_USERS[1]!.id, displayName: SEED_USERS[1]!.displayName },
    },
    {
      id: 'n-2',
      kind: 'inactive_3d',
      payload: { title: 'Ba ngày rồi đó!', body: 'Ghi nhận hôm nay để bắt đầu lại chuỗi ngày của bạn.', locale: 'vi', vars: { days: 3 } },
      sentAt: `${addDays(CHALLENGE_START, 10)}T13:00:00.000Z`,
      user: { id: SEED_USERS[2]!.id, displayName: SEED_USERS[2]!.displayName },
    },
    {
      id: 'n-3',
      kind: 'inactive_7d',
      payload: { title: 'Một tuần chưa thấy bạn đâu', body: 'Quay lại ghi nhận một hoạt động hôm nay nhé.', locale: 'vi', vars: { days: 7 } },
      sentAt: `${addDays(CHALLENGE_START, 9)}T13:00:00.000Z`,
      user: { id: SEED_USERS[1]!.id, displayName: SEED_USERS[1]!.displayName },
    },
  ];
}

const ADMIN_PLACES: SeedPlace[] = PLACE_NAMES.map((name) => ({ name, ...PLACE_COORDINATES[name]! }));

/** The admin console's in-memory fixture. `today` only affects the member-surface endpoints. */
export function makeAdminSeed(today: LocalDate = todayLocal()): Seed {
  const users = SEED_USERS.map((user) => ({ ...user }));
  const challenge = defaultChallenge();
  return {
    today,
    challenge,
    rules: defaultRules(challenge.id),
    me: users[0]!,
    users,
    entries: seedEntries(),
    places: ADMIN_PLACES.map((place) => ({ ...place })),
    feedback: seedFeedback(),
    notifications: seedNotifications(),
  };
}

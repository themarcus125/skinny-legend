import { addDays, eachDay, type LocalDate } from '@skinny/shared/dates';
import { RULEBOOK } from '@skinny/shared/scoring';
import type { Category } from '@skinny/shared/wire';
import type {
  AdminEntry,
  AdminUser,
  Challenge,
  FeedbackItem,
  NotificationLogItem,
  ScoringRule,
} from '../types';

/** The challenge window, hard-coded exactly as `ios/SkinnyLegend/Core/Models/Rulebook.swift` has it. */
export const CHALLENGE_START: LocalDate = '2026-09-08';
export const CHALLENGE_END: LocalDate = '2026-12-25';
export const CHALLENGE_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const STREAK_LENGTH = 7;
export const STREAK_POINTS = 5;

export interface SeedPlace {
  name: string;
  lat: number;
  lng: number;
}

/**
 * Everything `createMockApiClient` needs to answer every endpoint. Two factories produce one:
 * `makeSeed()` (the member/iOS fixture) and `makeAdminSeed()` (the admin console's fixture).
 */
export interface Seed {
  /** The mock's frozen notion of "today"; every score is computed as of this day. */
  today: LocalDate;
  challenge: Challenge;
  rules: ScoringRule[];
  /** The signed-in user. Always also present in `users`. */
  me: AdminUser;
  users: AdminUser[];
  entries: AdminEntry[];
  places: SeedPlace[];
  feedback: FeedbackItem[];
  notifications: NotificationLogItem[];
}

/** Inline SVG stand-ins for R2 photos: no network, no CSP surprises. */
export function svgImage(label: string, hue: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">` +
    `<rect width="96" height="96" rx="8" fill="hsl(${hue} 70% 86%)"/>` +
    `<text x="48" y="53" font-family="sans-serif" font-size="13" text-anchor="middle" fill="hsl(${hue} 45% 25%)">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** 0 = Monday … 6 = Sunday, the index `morningPatterns`/`eveningPatterns` are keyed by. */
export function weekdayIndex(day: LocalDate): number {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Noon in the challenge timezone, shifted by `minutes`. Noon anchors keep DST off the day. */
function anchor(day: LocalDate, minutes: number): string {
  const noon = new Date(`${day}T12:00:00+07:00`).getTime();
  return new Date(noon + minutes * 60_000).toISOString();
}

export function defaultChallenge(id = 'c-00000000-0000-4000-8000-000000000001'): Challenge {
  return {
    id,
    name: 'Operation Skinny Legend',
    startDate: CHALLENGE_START,
    endDate: CHALLENGE_END,
    timezone: CHALLENGE_TIMEZONE,
    streakPoints: STREAK_POINTS,
    streakLength: STREAK_LENGTH,
  };
}

/** The three rulebook rows, given ids so they look like `scoring_rules` rows. */
export function defaultRules(challengeId: string): ScoringRule[] {
  return RULEBOOK.map((rule, index) => ({ id: `r-${index + 1}`, challengeId, ...rule }));
}

/** Today in the challenge timezone. */
export function todayLocal(): LocalDate {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const ME: AdminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  firebaseUid: 'mock-me',
  displayName: 'Khoa',
  avatarKey: null,
  role: 'member',
  status: 'active',
  locale: 'vi',
  createdAt: new Date(1_788_600_000_000).toISOString(),
};

const OTHERS: AdminUser[] = [
  { id: '22222222-2222-4222-8222-22222222aaaa', firebaseUid: 'mock-linh', displayName: 'Linh', avatarKey: null, role: 'member', status: 'active', locale: 'vi', createdAt: new Date(1_788_600_100_000).toISOString() },
  { id: '33333333-3333-4333-8333-33333333bbbb', firebaseUid: 'mock-tuan', displayName: 'Tuấn', avatarKey: null, role: 'member', status: 'active', locale: 'vi', createdAt: new Date(1_788_600_200_000).toISOString() },
  { id: '44444444-4444-4444-8444-44444444cccc', firebaseUid: 'mock-mai', displayName: 'Mai', avatarKey: null, role: 'member', status: 'active', locale: 'vi', createdAt: new Date(1_788_600_300_000).toISOString() },
  { id: '55555555-5555-4555-8555-55555555dddd', firebaseUid: 'mock-duc', displayName: 'Đức', avatarKey: null, role: 'member', status: 'active', locale: 'vi', createdAt: new Date(1_788_600_400_000).toISOString() },
];

/** The six seeded places and their HCMC coordinates — same table as `MockSeed.swift`. */
export const MEMBER_PLACES: SeedPlace[] = [
  { name: 'Phòng gym California Fitness', lat: 10.7769, lng: 106.7009 },
  { name: 'Sân cầu lông Tân Bình', lat: 10.801, lng: 106.652 },
  { name: 'Công viên Gia Định', lat: 10.8122, lng: 106.674 },
  { name: 'Cơm tấm Ba Ghiền', lat: 10.789, lng: 106.691 },
  { name: 'Hồ bơi Lam Sơn', lat: 10.783, lng: 106.695 },
  { name: 'Bún chả Hương Liên', lat: 10.774, lng: 106.703 },
];

/**
 * Category patterns per weekday index, rotated per member. Index 0 = Monday. Every member
 * gets exactly two entries every day in the window, which keeps the paging tests meaningful
 * however few days of the challenge have elapsed.
 */
const MORNING_PATTERNS: Category[][] = [
  ['exercise'],
  ['exercise', 'group'],
  ['exercise'],
  ['exercise', 'meal'],
  ['exercise'],
  ['group'],
  ['exercise'],
];

const EVENING_PATTERNS: Category[][] = [
  ['meal'],
  ['meal'],
  ['meal', 'group'],
  ['meal'],
  ['meal'],
  ['meal'],
  ['meal', 'group'],
];

function clamp(value: LocalDate, low: LocalDate, high: LocalDate): LocalDate {
  return value < low ? low : value > high ? high : value;
}

/**
 * The member fixture: the TypeScript port of `ios/SkinnyLegend/Core/Mock/MockSeed.swift`.
 * Five active members with `me` first, up to fourteen days ending `today` (clamped to the
 * challenge window), two entries per member per day, ids `aaaaaaaa-0000-4000-8000-%012d`,
 * and `placeName`/`placeSource` nulled on every fourth counter.
 */
export function makeSeed(today: LocalDate = todayLocal()): Seed {
  const end = clamp(today, CHALLENGE_START, CHALLENGE_END);
  const start = clamp(addDays(end, -13), CHALLENGE_START, CHALLENGE_END);
  const users = [ME, ...OTHERS].map((user) => ({ ...user }));
  const entries: AdminEntry[] = [];
  let counter = 0;

  users.forEach((member, memberIndex) => {
    for (const day of eachDay(start, end)) {
      const slot = (weekdayIndex(day) + memberIndex) % 7;
      const slots: Array<[number, Category[]]> = [
        [-5, MORNING_PATTERNS[slot]!],
        [7, EVENING_PATTERNS[slot]!],
      ];
      for (const [offsetHours, pattern] of slots) {
        counter += 1;
        const takenAt = anchor(day, offsetHours * 60 + memberIndex * 7);
        const place = MEMBER_PLACES[(counter + memberIndex) % MEMBER_PLACES.length]!;
        const hidden = counter % 4 === 0;
        const hue = (counter * 37) % 360;
        entries.push({
          id: `aaaaaaaa-0000-4000-8000-${String(counter).padStart(12, '0')}`,
          userId: member.id,
          photoUrl: svgImage(`#${counter}`, hue),
          thumbUrl: svgImage(`#${counter}`, hue),
          takenAt,
          localDate: day,
          status: 'confirmed',
          categories: [...pattern],
          placeName: hidden ? null : place.name,
          placeSource: hidden ? 'none' : 'poi',
          createdAt: takenAt,
          user: { id: member.id, displayName: member.displayName },
          lat: hidden ? null : place.lat,
          lng: hidden ? null : place.lng,
          verdict: null,
        });
      }
    }
  });

  entries.sort((a, b) => (a.takenAt < b.takenAt ? 1 : a.takenAt > b.takenAt ? -1 : 0));

  const challenge = defaultChallenge();
  return {
    today: end,
    challenge,
    rules: defaultRules(challenge.id),
    me: users[0]!,
    users,
    entries,
    places: MEMBER_PLACES.map((place) => ({ ...place })),
    feedback: [],
    notifications: [],
  };
}

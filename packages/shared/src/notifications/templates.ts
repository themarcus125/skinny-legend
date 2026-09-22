import type { NotificationKind, NotificationLocale, NotificationVars } from './types.js';

export interface RenderedNotification {
  title: string;
  body: string;
}

type Template = (vars: NotificationVars) => RenderedNotification;

const VI: Record<NotificationKind, Template> = {
  inactive_1d: () => ({
    title: 'Hôm nay chưa ghi nhận gì?',
    body: 'Chụp một tấm buổi tập hoặc bữa ăn lành mạnh là có điểm ngay.',
  }),
  inactive_3d: () => ({
    title: 'Ba ngày rồi đó!',
    body: 'Ghi nhận hôm nay để bắt đầu lại chuỗi ngày của bạn.',
  }),
  inactive_7d: () => ({
    title: 'Một tuần chưa thấy bạn đâu',
    body: 'Quay lại ghi nhận một hoạt động hôm nay nhé.',
  }),
  // Spec §E fixes this wording: "Còn {gap} điểm là vượt {name}" plus, when the user is not
  // rank 2, "{gapToTop} điểm nữa để dẫn đầu".
  rank_nudge: (v) => ({
    title: `Bạn đang bám sát ${v.name ?? ''}`.trim(),
    body:
      v.gapToTop === undefined
        ? `Còn ${v.gap} điểm là vượt ${v.name}.`
        : `Còn ${v.gap} điểm là vượt ${v.name}. ${v.gapToTop} điểm nữa để dẫn đầu.`,
  }),
  heart: (v) => ({
    title: `${v.name ?? ''} đã thả tim`.trim(),
    body: `${v.name ?? ''} thích hoạt động của bạn.`.trim(),
  }),
  comment: (v) => ({
    title: `${v.name ?? ''} đã bình luận`.trim(),
    body: `“${v.excerpt ?? ''}”`,
  }),
};

const EN: Record<NotificationKind, Template> = {
  inactive_1d: () => ({
    title: 'Nothing logged today?',
    body: 'One photo of a workout or a healthy meal already scores.',
  }),
  inactive_3d: () => ({
    title: 'Three days already!',
    body: 'Log something today to start a new streak.',
  }),
  inactive_7d: () => ({
    title: 'It has been a week',
    body: 'Come back and log one activity today.',
  }),
  rank_nudge: (v) => ({
    title: `You are right behind ${v.name ?? ''}`.trim(),
    body:
      v.gapToTop === undefined
        ? `${v.gap} points behind ${v.name}.`
        : `${v.gap} points behind ${v.name}. ${v.gapToTop} points from the top.`,
  }),
  heart: (v) => ({
    title: `${v.name ?? ''} sent a heart`.trim(),
    body: `${v.name ?? ''} liked your activity.`.trim(),
  }),
  comment: (v) => ({
    title: `${v.name ?? ''} commented`.trim(),
    body: `“${v.excerpt ?? ''}”`,
  }),
};

const TEMPLATES: Record<NotificationLocale, Record<NotificationKind, Template>> = { vi: VI, en: EN };

/** Copy for `POST /admin/notifications/test`, which is not one of the planner kinds. */
export const TEST_NOTIFICATION: Record<NotificationLocale, RenderedNotification> = {
  vi: { title: 'Thử thông báo', body: 'Đây là thông báo thử từ bảng quản trị.' },
  en: { title: 'Test notification', body: 'This is a test push from the admin dashboard.' },
};

/** What a comment push shows of the body: whitespace collapsed, at most 80 characters plus "…". */
export const COMMENT_EXCERPT_MAX = 80;
export function commentExcerpt(body: string): string {
  const collapsed = body.replace(/\s+/g, ' ').trim();
  return collapsed.length > COMMENT_EXCERPT_MAX ? `${collapsed.slice(0, COMMENT_EXCERPT_MAX)}…` : collapsed;
}

/**
 * Renders one notification. `locale` is typed but arrives from a database column, so an
 * unrecognised value falls back to Vietnamese rather than throwing inside the cron job.
 */
export function renderNotification(
  kind: NotificationKind,
  locale: NotificationLocale,
  vars: NotificationVars = {},
): RenderedNotification {
  return (TEMPLATES[locale] ?? TEMPLATES.vi)[kind](vars);
}

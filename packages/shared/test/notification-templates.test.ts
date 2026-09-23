import { describe, it, expect } from 'vitest';
import { commentExcerpt, renderNotification, TEST_NOTIFICATION } from '../src/notifications/templates.js';
import { NOTIFICATION_KINDS, type NotificationLocale } from '../src/notifications/types.js';

const LOCALES: NotificationLocale[] = ['vi', 'en'];

describe('renderNotification', () => {
  it('renders a non-empty title and body for every kind in every locale', () => {
    for (const locale of LOCALES) {
      for (const kind of NOTIFICATION_KINDS) {
        const r = renderNotification(kind, locale, { days: 3, gap: 4, name: 'Minh', gapToTop: 9 });
        expect(r.title.length, `${locale}/${kind} title`).toBeGreaterThan(0);
        expect(r.body.length, `${locale}/${kind} body`).toBeGreaterThan(0);
      }
    }
  });

  it('uses the spec wording for a rank 2 nudge (no gapToTop sentence)', () => {
    const r = renderNotification('rank_nudge', 'vi', { gap: 4, name: 'Minh' });
    expect(r.body).toBe('Còn 4 điểm là vượt Minh.');
  });

  it('appends the lead sentence when gapToTop is present', () => {
    const r = renderNotification('rank_nudge', 'vi', { gap: 4, name: 'Minh', gapToTop: 11 });
    expect(r.body).toBe('Còn 4 điểm là vượt Minh. 11 điểm nữa để dẫn đầu.');
  });

  it('renders the English rank nudge with both sentences', () => {
    const r = renderNotification('rank_nudge', 'en', { gap: 4, name: 'Minh', gapToTop: 11 });
    expect(r.body).toBe('4 points behind Minh. 11 points from the top.');
  });

  it('falls back to Vietnamese for an unknown locale', () => {
    const r = renderNotification('inactive_3d', 'de' as NotificationLocale);
    expect(r).toEqual(renderNotification('inactive_3d', 'vi'));
  });

  it('exposes admin test-send copy in both locales', () => {
    expect(TEST_NOTIFICATION.vi.title).toBe('Thử thông báo');
    expect(TEST_NOTIFICATION.en.title).toBe('Test notification');
  });
});

describe('social templates', () => {
  it('renders a heart in both languages with the actor name', () => {
    expect(renderNotification('heart', 'vi', { name: 'Linh' })).toEqual({
      title: 'Linh đã thả tim',
      body: 'Linh thích hoạt động của bạn.',
    });
    expect(renderNotification('heart', 'en', { name: 'Linh' })).toEqual({
      title: 'Linh sent a heart',
      body: 'Linh liked your activity.',
    });
  });

  it('renders a comment with the quoted excerpt', () => {
    expect(renderNotification('comment', 'vi', { name: 'Linh', excerpt: 'Giỏi quá' })).toEqual({
      title: 'Linh đã bình luận',
      body: '“Giỏi quá”',
    });
    expect(renderNotification('comment', 'en', { name: 'Linh', excerpt: 'Nice' }).title).toBe('Linh commented');
  });

  it('commentExcerpt collapses whitespace and cuts at 80 characters with an ellipsis', () => {
    expect(commentExcerpt('  hai \n dòng  ')).toBe('hai dòng');
    const long = 'a'.repeat(100);
    expect(commentExcerpt(long)).toBe('a'.repeat(80) + '…');
    expect(commentExcerpt('a'.repeat(80))).toBe('a'.repeat(80));
  });
});

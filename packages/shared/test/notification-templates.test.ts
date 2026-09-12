import { describe, it, expect } from 'vitest';
import { renderNotification, TEST_NOTIFICATION } from '../src/notifications/templates.js';
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

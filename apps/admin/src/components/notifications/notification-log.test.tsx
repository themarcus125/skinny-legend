import { render, screen } from '@/test/intl';
import { describe, expect, it } from 'vitest';
import type { NotificationLogItem } from '@/lib/api/types';
import { NotificationLog } from './notification-log';

const items: NotificationLogItem[] = [
  {
    id: 'n-1',
    kind: 'rank_nudge',
    payload: { title: 'Bạn đang bám sát Khoa', body: 'Còn 6 điểm là vượt Khoa.', locale: 'vi', vars: { gap: 6, name: 'Khoa' } },
    sentAt: '2026-09-19T13:00:00.000Z',
    user: { id: 'u-2', displayName: 'Minh' },
  },
  {
    id: 'n-2',
    kind: 'inactive_3d',
    payload: { title: 'Ba ngày rồi đó!', body: 'Ghi nhận hôm nay để bắt đầu lại chuỗi ngày của bạn.', locale: 'vi', vars: { days: 3 } },
    sentAt: '2026-09-18T13:00:00.000Z',
    user: { id: 'u-3', displayName: 'Lan' },
  },
];

describe('NotificationLog', () => {
  it('renders the member, the Vietnamese kind label and the body of every row', () => {
    render(<NotificationLog items={items} />);
    expect(screen.getByText('Minh')).toBeInTheDocument();
    expect(screen.getByText('Bám sát thứ hạng')).toBeInTheDocument();
    expect(screen.getByText('Còn 6 điểm là vượt Khoa.')).toBeInTheDocument();
    expect(screen.getByText('Lan')).toBeInTheDocument();
    expect(screen.getByText('Vắng 3 ngày')).toBeInTheDocument();
  });

  it('shows the send time in the challenge timezone', () => {
    render(<NotificationLog items={items} />);
    expect(screen.getByText(/19\/09\/2026/)).toBeInTheDocument();
  });

  it('renders a table header row for every column', () => {
    render(<NotificationLog items={items} />);
    for (const header of ['Thành viên', 'Loại', 'Nội dung', 'Thời điểm']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
  });

  it('translates the kind labels and headers in English', () => {
    render(<NotificationLog items={items} />, { locale: 'en' });
    expect(screen.getByText('Rank nudge')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Member' })).toBeInTheDocument();
  });
});

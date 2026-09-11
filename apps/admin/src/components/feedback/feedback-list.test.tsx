import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FeedbackItem } from '@/lib/api/types';
import { FeedbackList } from './feedback-list';

const items: FeedbackItem[] = [
  {
    id: 'f-1',
    userId: 'u-2',
    message: 'Nút "Không đúng?" hơi khó thấy.',
    screenshotKey: 'feedback/uid-minh/shot-1.jpg',
    appVersion: '1.0 (12)',
    createdAt: '2026-09-10T12:20:00.000Z',
    screenshotUrl: 'https://r2.example/shot-1.jpg',
    user: { id: 'u-2', displayName: 'Minh' },
  },
  {
    id: 'f-2',
    userId: 'u-3',
    message: 'Cho mình xin thêm bộ lọc theo tuần.',
    screenshotKey: null,
    appVersion: null,
    createdAt: '2026-09-09T02:40:00.000Z',
    screenshotUrl: null,
    user: { id: 'u-3', displayName: 'Lan' },
  },
];

describe('FeedbackList', () => {
  it('renders the author, message and app version of every row', () => {
    render(<FeedbackList items={items} />);
    expect(screen.getByText('Minh')).toBeInTheDocument();
    expect(screen.getByText('Nút "Không đúng?" hơi khó thấy.')).toBeInTheDocument();
    expect(screen.getByText('1.0 (12)')).toBeInTheDocument();
    expect(screen.getByText('Lan')).toBeInTheDocument();
  });

  it('links to the screenshot only when there is one', () => {
    render(<FeedbackList items={items} />);
    const links = screen.getAllByRole('link', { name: 'Xem ảnh chụp màn hình' });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://r2.example/shot-1.jpg');
    expect(links[0]).toHaveAttribute('target', '_blank');
  });

  it('shows the timestamp in the challenge timezone', () => {
    render(<FeedbackList items={items} />);
    expect(screen.getByText(/10\/09\/2026/)).toBeInTheDocument();
  });
});

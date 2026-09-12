import { fireEvent, render, screen, within } from '@/test/intl';
import { describe, expect, it, vi } from 'vitest';
import type { AdminEntry } from '@/lib/api/types';
import { EntriesTable } from './entries-table';

function entry(overrides: Partial<AdminEntry> = {}): AdminEntry {
  return {
    id: 'e-1',
    userId: 'u-1',
    photoUrl: 'https://example.com/photo.jpg',
    thumbUrl: 'https://example.com/thumb.jpg',
    takenAt: '2026-09-08T06:30:00+07:00',
    localDate: '2026-09-08',
    status: 'pending',
    categories: ['exercise'],
    placeName: null,
    placeSource: 'none',
    createdAt: '2026-09-08T06:30:00+07:00',
    user: { id: 'u-1', displayName: 'Minh' },
    lat: null,
    lng: null,
    verdict: {
      categories: ['exercise'],
      healthy: null,
      confidence: 0.91,
      reason: 'Ảnh chụp trong phòng gym.',
      model: 'qwen/qwen3.7-flash',
      failed: false,
    },
    ...overrides,
  };
}

describe('EntriesTable', () => {
  it('calls onOverride with the row entry when "Sửa" is clicked', () => {
    const onOverride = vi.fn();
    const row = entry({ id: 'e-2', user: { id: 'u-1', displayName: 'Lan' } });
    render(<EntriesTable entries={[row]} onOverride={onOverride} onReject={vi.fn()} isMutating={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));

    expect(onOverride).toHaveBeenCalledWith(row);
  });

  it('calls onReject with the row entry when "Từ chối" is clicked', () => {
    const onReject = vi.fn();
    const row = entry({ id: 'e-3', status: 'confirmed' });
    render(<EntriesTable entries={[row]} onOverride={vi.fn()} onReject={onReject} isMutating={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));

    expect(onReject).toHaveBeenCalledWith(row);
  });

  it('disables "Từ chối" on an already-rejected row but keeps "Sửa" enabled', () => {
    render(
      <EntriesTable
        entries={[entry({ id: 'e-4', status: 'rejected' })]}
        onOverride={vi.fn()}
        onReject={vi.fn()}
        isMutating={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Từ chối' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sửa' })).not.toBeDisabled();
  });

  it('disables every row action while a mutation is in flight', () => {
    render(
      <EntriesTable
        entries={[entry({ id: 'e-5', status: 'confirmed' })]}
        onOverride={vi.fn()}
        onReject={vi.fn()}
        isMutating
      />,
    );

    expect(screen.getByRole('button', { name: 'Sửa' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Từ chối' })).toBeDisabled();
  });

  it('renders the verdict summary, reason and category chips for a row', () => {
    render(
      <EntriesTable
        entries={[entry({ categories: ['exercise', 'group'] })]}
        onOverride={vi.fn()}
        onReject={vi.fn()}
        isMutating={false}
      />,
    );

    const row = screen.getByRole('row', { name: /Minh/ });
    expect(within(row).getByText('Thể thao · 91%')).toBeInTheDocument();
    expect(within(row).getByText('Ảnh chụp trong phòng gym.')).toBeInTheDocument();
  });

  it('shows an em-dash placeholder for an entry with no categories', () => {
    render(
      <EntriesTable entries={[entry({ categories: [] })]} onOverride={vi.fn()} onReject={vi.fn()} isMutating={false} />,
    );

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminEntry } from '@/lib/api/types';
import { OverrideDialog } from './override-dialog';

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

describe('OverrideDialog', () => {
  it('renders nothing when there is no entry to edit', () => {
    render(<OverrideDialog entry={null} onClose={vi.fn()} onSave={vi.fn()} isSaving={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('saves the entry unchanged when confirmed without edits', () => {
    const onSave = vi.fn();
    const row = entry();
    render(<OverrideDialog entry={row} onClose={vi.fn()} onSave={onSave} isSaving={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(onSave).toHaveBeenCalledWith('e-1', { categories: ['exercise'], status: 'pending' });
  });

  it('adds a toggled category and the changed status to the saved patch', () => {
    const onSave = vi.fn();
    const row = entry({ categories: ['exercise'], status: 'pending' });
    render(<OverrideDialog entry={row} onClose={vi.fn()} onSave={onSave} isSaving={false} />);

    // Turn on the "meal" category switch.
    fireEvent.click(screen.getByRole('switch', { name: 'Bữa ăn lành mạnh' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    const [, patch] = onSave.mock.calls[0] as [string, { categories: string[]; status: string }];
    expect(patch.categories).toEqual(expect.arrayContaining(['exercise', 'meal']));
    expect(patch.categories).toHaveLength(2);
    expect(patch.status).toBe('pending');
  });

  it('removes a toggled-off category from the saved patch', () => {
    const onSave = vi.fn();
    const row = entry({ categories: ['exercise', 'meal'] });
    render(<OverrideDialog entry={row} onClose={vi.fn()} onSave={onSave} isSaving={false} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Thể thao' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(onSave).toHaveBeenCalledWith('e-1', { categories: ['meal'], status: 'pending' });
  });

  it('changes the status through the select and includes it in the saved patch', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    const row = entry({ status: 'pending' });
    render(<OverrideDialog entry={row} onClose={vi.fn()} onSave={onSave} isSaving={false} />);

    await user.click(screen.getByRole('combobox', { name: /Trạng thái/ }));
    const option = await screen.findByRole('option', { name: 'Đã xác nhận' });
    await user.click(option);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(onSave).toHaveBeenCalledWith('e-1', { categories: ['exercise'], status: 'confirmed' });
  });

  it('shows the Vietnamese status label on the closed trigger, not the raw value', () => {
    render(<OverrideDialog entry={entry({ status: 'confirmed' })} onClose={vi.fn()} onSave={vi.fn()} isSaving={false} />);

    const trigger = screen.getByRole('combobox', { name: /Trạng thái/ });
    expect(trigger).toHaveTextContent('Đã xác nhận');
    expect(trigger).not.toHaveTextContent('confirmed');
  });

  it('calls onClose without saving when "Huỷ" is clicked', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<OverrideDialog entry={entry()} onClose={onClose} onSave={onSave} isSaving={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));

    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('disables the save button while saving', () => {
    render(<OverrideDialog entry={entry()} onClose={vi.fn()} onSave={vi.fn()} isSaving />);
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
  });
});

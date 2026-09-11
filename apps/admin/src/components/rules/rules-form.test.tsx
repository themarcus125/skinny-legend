import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RulesResponse } from '@/lib/api/types';
import { RulesForm } from './rules-form';

function response(overrides: Partial<RulesResponse> = {}): RulesResponse {
  return {
    challenge: {
      id: 'c-1',
      name: 'Operation Skinny Legend',
      startDate: '2026-09-08',
      endDate: '2026-12-25',
      timezone: 'Asia/Ho_Chi_Minh',
      streakPoints: 5,
      streakLength: 7,
    },
    rules: [
      { id: 'r-1', challengeId: 'c-1', category: 'exercise', points: 3, capCount: 1, capPeriod: 'day' },
      { id: 'r-2', challengeId: 'c-1', category: 'meal', points: 2, capCount: 1, capPeriod: 'day' },
      { id: 'r-3', challengeId: 'c-1', category: 'group', points: 3, capCount: 2, capPeriod: 'week' },
    ],
    ...overrides,
  };
}

describe('RulesForm', () => {
  it('submits exactly the PUT payload after confirming the retroactive-change dialog', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<RulesForm data={response()} onSave={onSave} isSaving={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Lưu luật chơi' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Áp dụng luật mới?')).toBeInTheDocument();
    expect(within(dialog).getByText(/hồi tố/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Áp dụng' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      challenge: { startDate: '2026-09-08', endDate: '2026-12-25', streakPoints: 5, streakLength: 7 },
      rules: [
        { category: 'exercise', points: 3, capCount: 1, capPeriod: 'day' },
        { category: 'meal', points: 2, capCount: 1, capPeriod: 'day' },
        { category: 'group', points: 3, capCount: 2, capPeriod: 'week' },
      ],
    });
  });

  it('submits the edited value, not the original, once confirmed', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<RulesForm data={response()} onSave={onSave} isSaving={false} />);

    const pointsInputs = screen.getAllByLabelText('Điểm');
    await user.clear(pointsInputs[0]!);
    await user.type(pointsInputs[0]!, '4');

    fireEvent.click(screen.getByRole('button', { name: 'Lưu luật chơi' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Áp dụng' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ rules: expect.arrayContaining([expect.objectContaining({ category: 'exercise', points: 4 })]) }));
  });

  it('does not submit when the confirmation dialog is cancelled', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<RulesForm data={response()} onSave={onSave} isSaving={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Lưu luật chơi' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Huỷ' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the Vietnamese message, not a Zod default, when a number field is cleared', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<RulesForm data={response()} onSave={onSave} isSaving={false} />);

    await user.clear(screen.getByLabelText('Điểm thưởng'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu luật chơi' }));

    expect(await screen.findByText('Phải là số')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('blocks a duplicate category client-side before any dialog opens', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<RulesForm data={response()} onSave={onSave} isSaving={false} />);

    // Change the second row ("Bữa ăn lành mạnh") to "Thể thao", duplicating the first row.
    const categoryTriggers = screen.getAllByRole('combobox', { name: 'Hạng mục' });
    await user.click(categoryTriggers[1]!);
    await user.click(await screen.findByRole('option', { name: 'Thể thao' }));

    fireEvent.click(screen.getByRole('button', { name: 'Lưu luật chơi' }));

    expect(await screen.findByText('Mỗi hạng mục chỉ được xuất hiện một lần')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('disables "Thêm hạng mục" once all categories are already in use', () => {
    render(<RulesForm data={response()} onSave={vi.fn()} isSaving={false} />);
    expect(screen.getByRole('button', { name: 'Thêm hạng mục' })).toBeDisabled();
  });

  it('shows the read-only server timezone', () => {
    render(<RulesForm data={response()} onSave={vi.fn()} isSaving={false} />);
    expect(screen.getByText(/Asia\/Ho_Chi_Minh/)).toBeInTheDocument();
  });

  it('disables the submit button while saving', () => {
    render(<RulesForm data={response()} onSave={vi.fn()} isSaving />);
    expect(screen.getByRole('button', { name: 'Lưu luật chơi' })).toBeDisabled();
  });
});

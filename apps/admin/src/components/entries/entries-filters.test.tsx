import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@/lib/api/types';
import { EMPTY_FILTER_FORM } from './filters';
import { EntriesFilters } from './entries-filters';

function member(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'u-1',
    firebaseUid: 'uid-1',
    displayName: 'Minh',
    avatarKey: null,
    role: 'member',
    status: 'active',
    createdAt: '2026-09-08T02:30:00.000Z',
    ...overrides,
  };
}

describe('EntriesFilters', () => {
  it('reports the picked status tab', () => {
    const onChange = vi.fn();
    render(<EntriesFilters value={EMPTY_FILTER_FORM} onChange={onChange} members={[]} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Chờ xác nhận' }));

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER_FORM, status: 'pending' });
  });

  it('reports the picked member from the select', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <EntriesFilters
        value={EMPTY_FILTER_FORM}
        onChange={onChange}
        members={[member({ id: 'u-2', displayName: 'Minh' })]}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    const option = await screen.findByRole('option', { name: 'Minh' });
    await user.click(option);

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER_FORM, user: 'u-2' });
  });

  it('reports the "from" date as a plain filter field, unaffected by other fields', () => {
    const onChange = vi.fn();
    render(<EntriesFilters value={EMPTY_FILTER_FORM} onChange={onChange} members={[]} />);

    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-09-09' } });

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER_FORM, from: '2026-09-09' });
  });

  it('reports the "to" date', () => {
    const onChange = vi.fn();
    render(<EntriesFilters value={EMPTY_FILTER_FORM} onChange={onChange} members={[]} />);

    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-09-30' } });

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER_FORM, to: '2026-09-30' });
  });

  it('resets to the empty form when "Xoá bộ lọc" is clicked', () => {
    const onChange = vi.fn();
    render(
      <EntriesFilters
        value={{ user: 'u-2', status: 'pending', from: '2026-09-08', to: '2026-09-30' }}
        onChange={onChange}
        members={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));

    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTER_FORM);
  });
});

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@/lib/api/types';
import { MembersTable } from './members-table';

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

describe('MembersTable', () => {
  it('approves a pending member with one click', () => {
    const onPatch = vi.fn();
    render(
      <MembersTable
        users={[member({ id: 'u-2', displayName: 'Tuấn', status: 'pending' })]}
        onPatch={onPatch}
        isPatching={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));

    expect(onPatch).toHaveBeenCalledWith('u-2', { status: 'active' });
  });

  it('disables a member only after confirming the dialog, and not on cancel', () => {
    const onPatch = vi.fn();
    render(
      <MembersTable
        users={[member({ id: 'u-3', displayName: 'Lan', status: 'active' })]}
        onPatch={onPatch}
        isPatching={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Khoá tài khoản' }));
    expect(screen.getByText('Khoá tài khoản?')).toBeInTheDocument();

    // Cancelling must not patch.
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onPatch).not.toHaveBeenCalled();

    // Reopen and confirm inside the dialog.
    fireEvent.click(screen.getByRole('button', { name: 'Khoá tài khoản' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Khoá tài khoản' }));

    expect(onPatch).toHaveBeenCalledWith('u-3', { status: 'disabled' });
  });

  it('changes a member role through the select', async () => {
    const onPatch = vi.fn();
    const user = userEvent.setup();
    render(
      <MembersTable
        users={[member({ id: 'u-4', displayName: 'Khoa', role: 'member' })]}
        onPatch={onPatch}
        isPatching={false}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Vai trò của Khoa' }));
    const option = await screen.findByRole('option', { name: 'Quản trị' });
    await user.click(option);

    expect(onPatch).toHaveBeenCalledWith('u-4', { role: 'admin' });
  });

  it('hides the disable control and disables the role select on the signed-in admin own row', () => {
    const onPatch = vi.fn();
    render(
      <MembersTable
        users={[member({ id: 'self-1', displayName: 'Khoa', status: 'active' })]}
        onPatch={onPatch}
        isPatching={false}
        currentUserId="self-1"
      />,
    );

    expect(screen.queryByRole('button', { name: 'Khoá tài khoản' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Vai trò của Khoa' })).toBeDisabled();
  });

  it('keeps approve/reactivate available on the current user own row', () => {
    const onPatch = vi.fn();
    const { rerender } = render(
      <MembersTable
        users={[member({ id: 'self-2', displayName: 'Khoa', status: 'pending' })]}
        onPatch={onPatch}
        isPatching={false}
        currentUserId="self-2"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));
    expect(onPatch).toHaveBeenCalledWith('self-2', { status: 'active' });

    onPatch.mockClear();
    rerender(
      <MembersTable
        users={[member({ id: 'self-2', displayName: 'Khoa', status: 'disabled' })]}
        onPatch={onPatch}
        isPatching={false}
        currentUserId="self-2"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mở lại' }));
    expect(onPatch).toHaveBeenCalledWith('self-2', { status: 'active' });
  });

  it('disables every control while a patch is in flight', () => {
    render(
      <MembersTable
        users={[member({ id: 'u-5', displayName: 'Minh', status: 'pending' })]}
        onPatch={vi.fn()}
        isPatching
      />,
    );

    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Vai trò của Minh' })).toBeDisabled();
  });
});

import { render, screen } from '@/test/intl';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '@/lib/api/types';
import { TestSendForm } from './test-send-form';

const users: AdminUser[] = [
  { id: 'u-1', firebaseUid: 'uid-khoa', displayName: 'Khoa', avatarKey: null, role: 'admin', status: 'active', createdAt: '2026-09-08T01:00:00.000Z' },
  { id: 'u-2', firebaseUid: 'uid-minh', displayName: 'Minh', avatarKey: null, role: 'member', status: 'active', createdAt: '2026-09-08T02:00:00.000Z' },
  { id: 'u-4', firebaseUid: 'uid-tuan', displayName: 'Tuấn', avatarKey: null, role: 'member', status: 'pending', createdAt: '2026-09-10T03:00:00.000Z' },
];

describe('TestSendForm', () => {
  it('disables the button until a member is chosen', () => {
    render(<TestSendForm users={users} onSend={vi.fn()} isSending={false} />);
    expect(screen.getByRole('button', { name: 'Gửi thử' })).toBeDisabled();
  });

  it('sends to the chosen member', async () => {
    const onSend = vi.fn();
    render(<TestSendForm users={users} onSend={onSend} isSending={false} />);
    await userEvent.selectOptions(screen.getByLabelText('Thành viên'), 'u-2');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi thử' }));
    expect(onSend).toHaveBeenCalledWith('u-2');
  });

  it('offers only active members: a pending account has no app and no device', () => {
    render(<TestSendForm users={users} onSend={vi.fn()} isSending={false} />);
    expect(screen.getByRole('option', { name: 'Minh' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Tuấn' })).not.toBeInTheDocument();
  });

  it('disables the button while a send is in flight', async () => {
    render(<TestSendForm users={users} onSend={vi.fn()} isSending />);
    await userEvent.selectOptions(screen.getByLabelText('Thành viên'), 'u-2');
    expect(screen.getByRole('button', { name: 'Đang gửi…' })).toBeDisabled();
  });

  it('renders the English copy under the en locale', () => {
    render(<TestSendForm users={users} onSend={vi.fn()} isSending={false} />, { locale: 'en' });
    expect(screen.getByLabelText('Member')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send test' })).toBeDisabled();
  });
});

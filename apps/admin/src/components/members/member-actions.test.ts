import { describe, expect, it } from 'vitest';
import type { AdminUser } from '@/lib/api/types';
import { availableActions, statusVariant } from './member-actions';

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

describe('availableActions', () => {
  it('offers a one-click approval for a pending member', () => {
    expect(availableActions(member({ status: 'pending' }))).toEqual([
      { key: 'approve', label: 'Duyệt', patch: { status: 'active' }, confirm: false },
    ]);
  });

  it('offers a confirmed disable for an active member', () => {
    expect(availableActions(member({ status: 'active' }))).toEqual([
      { key: 'disable', label: 'Khoá tài khoản', patch: { status: 'disabled' }, confirm: true },
    ]);
  });

  it('offers reactivation for a disabled member', () => {
    expect(availableActions(member({ status: 'disabled' }))).toEqual([
      { key: 'reactivate', label: 'Mở lại', patch: { status: 'active' }, confirm: false },
    ]);
  });
});

describe('statusVariant', () => {
  it('maps each status to a badge variant', () => {
    expect(statusVariant('active')).toBe('default');
    expect(statusVariant('pending')).toBe('secondary');
    expect(statusVariant('disabled')).toBe('destructive');
  });
});

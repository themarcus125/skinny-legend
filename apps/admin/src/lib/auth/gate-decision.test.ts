import { describe, expect, it } from 'vitest';
import { gateDecision } from './gate-decision';
import type { AdminUser } from '@/lib/api/types';

const admin: AdminUser = {
  id: 'u-1',
  firebaseUid: 'uid-khoa',
  displayName: 'Khoa',
  avatarKey: null,
  role: 'admin',
  status: 'active',
  locale: 'vi',
  createdAt: '2026-09-08T01:00:00.000Z',
};

describe('gateDecision', () => {
  it('waits while the session is loading', () => {
    expect(gateDecision({ status: 'loading', user: null, error: null })).toEqual({ kind: 'loading' });
  });

  it('asks for sign-in when signed out', () => {
    expect(gateDecision({ status: 'signed-out', user: null, error: null })).toEqual({ kind: 'sign-in' });
  });

  it('surfaces the error message key untouched', () => {
    // `error` is whatever describeError() produced in auth-context: a key the gate renders with t().
    expect(gateDecision({ status: 'error', user: null, error: 'errors.forbidden' })).toEqual({
      kind: 'error',
      message: 'errors.forbidden',
    });
  });

  it('falls back to the generic sign-in failure key when the error carries no message', () => {
    expect(gateDecision({ status: 'error', user: null, error: null })).toEqual({
      kind: 'error',
      message: 'auth.signInFailed',
    });
  });

  it('allows an active admin', () => {
    expect(gateDecision({ status: 'signed-in', user: admin, error: null })).toEqual({ kind: 'allow' });
  });

  it('refuses a member, a pending admin and a disabled admin', () => {
    expect(gateDecision({ status: 'signed-in', user: { ...admin, role: 'member' }, error: null })).toEqual({ kind: 'not-authorized' });
    expect(gateDecision({ status: 'signed-in', user: { ...admin, status: 'pending' }, error: null })).toEqual({ kind: 'not-authorized' });
    expect(gateDecision({ status: 'signed-in', user: { ...admin, status: 'disabled' }, error: null })).toEqual({ kind: 'not-authorized' });
  });
});

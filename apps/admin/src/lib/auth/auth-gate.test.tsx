import { render, screen } from '@/test/intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAdminApi } from '@/lib/api/mock';
import type { AdminUser } from '@/lib/api/types';
import { AuthContext, type AuthState } from './auth-context';
import { AuthGate } from './auth-gate';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }) }));

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

function renderGate(state: Partial<AuthState>) {
  const value: AuthState = {
    status: 'loading',
    user: null,
    error: null,
    hasFirebaseUser: false,
    api: new MockAdminApi(),
    signIn: vi.fn(),
    signOutUser: vi.fn(),
    ...state,
  };
  return render(
    <AuthContext.Provider value={value}>
      <AuthGate>
        <p>Nội dung quản trị</p>
      </AuthGate>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  replace.mockClear();
});

describe('AuthGate', () => {
  it('renders children for an active admin', () => {
    renderGate({ status: 'signed-in', user: admin });
    expect(screen.getByText('Nội dung quản trị')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('offers Google sign-in when signed out', () => {
    renderGate({ status: 'signed-out' });
    expect(screen.getByRole('button', { name: /Google/i })).toBeInTheDocument();
    expect(screen.queryByText('Nội dung quản trị')).not.toBeInTheDocument();
  });

  it('renders the error key as its Vietnamese message', () => {
    renderGate({ status: 'error', error: 'errors.forbidden' });
    expect(screen.getByRole('alert')).toHaveTextContent('Tài khoản này không có quyền quản trị.');
  });

  it('renders a raw developer error (missing env) as it is', () => {
    renderGate({ status: 'error', error: 'Missing NEXT_PUBLIC_API_BASE_URL' });
    expect(screen.getByRole('alert')).toHaveTextContent('Missing NEXT_PUBLIC_API_BASE_URL');
  });

  it('redirects a non-admin to /not-authorized', () => {
    renderGate({ status: 'signed-in', user: { ...admin, role: 'member' } });
    expect(replace).toHaveBeenCalledWith('/not-authorized');
    expect(screen.queryByText('Nội dung quản trị')).not.toBeInTheDocument();
  });
});

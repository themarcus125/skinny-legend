import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAdminApi } from '@/lib/api/mock';
import { AuthContext, type AuthState } from '@/lib/auth/auth-context';
import NotAuthorizedPage from '@/app/not-authorized/page';
import { SignOutButton } from './sign-out-button';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }) }));

function contextValue(overrides: Partial<AuthState> = {}): AuthState {
  return {
    status: 'signed-in',
    user: null,
    error: null,
    hasFirebaseUser: false,
    api: new MockAdminApi(),
    signIn: vi.fn(),
    signOutUser: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  replace.mockClear();
});

describe('SignOutButton', () => {
  it('signs out and redirects home when clicked', async () => {
    const signOutUser = vi.fn().mockResolvedValue(undefined);
    render(
      <AuthContext.Provider value={contextValue({ signOutUser })}>
        <SignOutButton />
      </AuthContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));

    await vi.waitFor(() => {
      expect(signOutUser).toHaveBeenCalled();
      expect(replace).toHaveBeenCalledWith('/');
    });
  });
});

describe('NotAuthorizedPage', () => {
  it('offers a sign-out affordance so a refused account is not stuck', async () => {
    const signOutUser = vi.fn().mockResolvedValue(undefined);
    render(
      <AuthContext.Provider value={contextValue({ signOutUser })}>
        <NotAuthorizedPage />
      </AuthContext.Provider>,
    );

    const button = screen.getByRole('button', { name: 'Đăng xuất' });
    fireEvent.click(button);

    await vi.waitFor(() => {
      expect(signOutUser).toHaveBeenCalled();
      expect(replace).toHaveBeenCalledWith('/');
    });
  });
});

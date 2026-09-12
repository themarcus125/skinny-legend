import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@/test/intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockAdminApi } from '@/lib/api/mock';
import type { AdminUser } from '@/lib/api/types';
import { AuthProvider, useAuth } from './auth-context';

const user: AdminUser = {
  id: 'u-1',
  firebaseUid: 'uid-khoa',
  displayName: 'Khoa',
  avatarKey: null,
  role: 'admin',
  status: 'active',
  createdAt: '2026-09-08T01:00:00.000Z',
};

function Consumer() {
  const { status, signOutUser } = useAuth();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <button onClick={() => void signOutUser()}>sign out</button>
    </div>
  );
}

function renderProvider(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.doUnmock('firebase/auth');
  vi.doUnmock('./firebase');
});

describe('AuthProvider', () => {
  it('clears the React Query cache on sign-out', async () => {
    const client = new QueryClient();
    client.setQueryData(['probe'], 1);

    renderProvider(client);

    // Wait for the mock-mode session load to settle so we sign out from a known state.
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-in'));

    fireEvent.click(screen.getByRole('button', { name: 'sign out' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out'));
    expect(client.getQueryData(['probe'])).toBeUndefined();
  });

  it('ignores a session load that resolves after a newer sign-out (stale-write guard)', async () => {
    let resolveSession!: (value: AdminUser) => void;
    const deferred = new Promise<AdminUser>((resolve) => {
      resolveSession = resolve;
    });
    vi.spyOn(MockAdminApi.prototype, 'session').mockReturnValue(deferred);

    const client = new QueryClient();
    renderProvider(client);

    // The initial session load is still pending (deferred, not yet resolved).
    expect(screen.getByTestId('status')).toHaveTextContent('loading');

    fireEvent.click(screen.getByRole('button', { name: 'sign out' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out'));

    // Now let the stale session load finish. Without the generation guard this would flip
    // the status back to 'signed-in', overwriting the newer sign-out.
    resolveSession(user);
    await deferred;

    // Give the resolved promise's continuation a turn to run (and, if unguarded, to call setState).
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByTestId('status')).toHaveTextContent('signed-out');
  });

  it('fails loudly when NEXT_PUBLIC_API_BASE_URL is unset (live mode)', async () => {
    // API_BASE_URL is read from process.env at module load time, so the module must be
    // re-imported fresh after stubbing the env vars for the stub to take effect.
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_MOCK', '');
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');

    const { AuthProvider: FreshAuthProvider, useAuth: freshUseAuth } = await import('./auth-context');

    function FreshConsumer() {
      const { status, error } = freshUseAuth();
      return (
        <div>
          <p data-testid="status">{status}</p>
          <p data-testid="error">{error}</p>
        </div>
      );
    }

    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <FreshAuthProvider>
          <FreshConsumer />
        </FreshAuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    expect(screen.getByTestId('error')).toHaveTextContent('Thiếu biến môi trường NEXT_PUBLIC_API_BASE_URL');
  });

  it('sets status to error when the live sign-out call fails', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_MOCK', '');
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:3000');

    vi.doMock('firebase/auth', () => ({
      onAuthStateChanged: vi.fn(() => vi.fn()),
      signInWithPopup: vi.fn(),
      signOut: vi.fn().mockRejectedValue(new Error('network down')),
    }));
    vi.doMock('./firebase', () => ({
      firebaseAuth: vi.fn(() => ({})),
      googleProvider: vi.fn(() => ({})),
      isFirebaseConfigured: vi.fn(() => true),
    }));

    const { AuthProvider: FreshAuthProvider, useAuth: freshUseAuth } = await import('./auth-context');

    function FreshConsumer() {
      const { status, signOutUser } = freshUseAuth();
      return (
        <div>
          <p data-testid="status">{status}</p>
          <button onClick={() => void signOutUser()}>sign out</button>
        </div>
      );
    }

    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <FreshAuthProvider>
          <FreshConsumer />
        </FreshAuthProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'sign out' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
  });
});

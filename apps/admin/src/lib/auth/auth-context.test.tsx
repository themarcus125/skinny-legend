import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
});

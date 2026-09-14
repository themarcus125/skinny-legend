import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@/test/intl';
import { ApiProvider, IS_MOCK, useApi } from './api';

function Probe() {
  const api = useApi();
  return <span data-testid="probe">{api.constructor.name}</span>;
}

describe('mock mode', () => {
  it('is on under VITE_MOCK=1', () => {
    expect(IS_MOCK).toBe(true);
  });

  it('resolves the mock client from @skinny/api-client/mock', async () => {
    render(
      <ApiProvider>
        <Probe />
      </ApiProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('MockApiClient'));
  });

  it('serves the shared seed through the provided client', async () => {
    const { createMockApiClient, makeSeed } = await import('@skinny/api-client/mock');
    const client = createMockApiClient({ seed: makeSeed() });
    const leaderboard = await client.leaderboard();
    expect(leaderboard.length).toBeGreaterThan(0);
    expect(leaderboard[0]?.rank).toBe(1);
  });
});

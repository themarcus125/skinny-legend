import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import type { ApiClient } from '@skinny/api-client';
import { createMockApiClient, makeSeed } from '@skinny/api-client/mock';
import { ApiProvider } from '@/lib/api';
import { makeQueryClient } from '@/lib/query';
import { render, screen, waitFor, within } from '@/test/intl';
import { CommentSheet } from './comment-sheet';

const seeded = () => createMockApiClient({ seed: makeSeed('2026-09-14'), latencyMs: 0 });

/**
 * The *app's* client, not a bare one: its `staleTime` is what a refetch after a delete has to
 * get past, so a test client without it would pass over exactly that bug.
 */
function testQueryClient() {
  const queryClient = makeQueryClient();
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({
    ...defaults,
    queries: { ...defaults.queries, retry: false },
    mutations: { ...defaults.mutations, retry: false },
  });
  return queryClient;
}

function renderSheet(api: ApiClient, entryId: string, onCountChange = vi.fn()) {
  const queryClient = testQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>{children}</ApiProvider>
    </QueryClientProvider>
  );
  render(<CommentSheet entryId={entryId} onDismiss={() => {}} onCountChange={onCountChange} />, {
    wrapper: Wrapper,
  });
  return { onCountChange };
}

describe('the comment sheet', () => {
  it('lists the seeded comments oldest first with the author and a relative time', async () => {
    const api = seeded();
    const withComments = api.seed.comments[0]!;
    renderSheet(api, withComments.entryId);
    const rows = await screen.findAllByTestId('comment-row');
    expect(rows.length).toBeGreaterThan(0);
    expect(within(rows[0]!).getByText(withComments.body)).toBeInTheDocument();
  });

  it('posts, clears the composer, and reports the new count', async () => {
    const api = seeded();
    const entry = api.seed.entries.find(
      (e) => e.status === 'confirmed' && !api.seed.comments.some((c) => c.entryId === e.id),
    )!;
    const { onCountChange } = renderSheet(api, entry.id);
    await screen.findByTestId('comment-empty');

    const input = screen.getByTestId('comment-input');
    const send = screen.getByTestId('comment-send');
    expect(send).toBeDisabled();
    await userEvent.type(input, '   ');
    expect(send).toBeDisabled();
    await userEvent.type(input, 'Giỏi quá!');
    expect(send).toBeEnabled();
    await userEvent.click(send);

    const row = await screen.findByTestId('comment-row');
    expect(row).toHaveTextContent('Giỏi quá!');
    expect(input).toHaveValue('');
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(1));
  });

  it('shows Xoá only where I may delete, and deleting drops the row and the count', async () => {
    const api = seeded();
    const theirs = api.seed.comments.find((c) => {
      const entry = api.seed.entries.find((e) => e.id === c.entryId)!;
      return c.userId !== api.seed.me.id && entry.userId !== api.seed.me.id;
    })!;
    const { onCountChange } = renderSheet(api, theirs.entryId);
    const before = (await screen.findAllByTestId('comment-row')).length;
    expect(screen.queryByTestId('comment-delete')).not.toBeInTheDocument();

    await userEvent.type(screen.getByTestId('comment-input'), 'mine');
    await userEvent.click(screen.getByTestId('comment-send'));
    const del = await screen.findByTestId('comment-delete');
    await userEvent.click(del);
    await waitFor(() => expect(screen.getAllByTestId('comment-row')).toHaveLength(before));
    expect(onCountChange).toHaveBeenLastCalledWith(before);
  });

  it('keeps the text and shows a banner when posting fails', async () => {
    const api = seeded();
    vi.spyOn(api, 'postComment').mockRejectedValue(new TypeError('offline'));
    const entry = api.seed.entries.find((e) => e.status === 'confirmed')!;
    renderSheet(api, entry.id);
    await screen.findByTestId('comment-list');
    await userEvent.type(screen.getByTestId('comment-input'), 'hello');
    await userEvent.click(screen.getByTestId('comment-send'));
    await screen.findByTestId('comment-error');
    expect(screen.getByTestId('comment-input')).toHaveValue('hello');
  });

  it('names the delete when deleting fails, and keeps the row', async () => {
    const api = seeded();
    vi.spyOn(api, 'deleteComment').mockRejectedValue(new TypeError('offline'));
    const entry = api.seed.entries.find((e) => e.status === 'confirmed')!;
    renderSheet(api, entry.id);
    await screen.findByTestId('comment-list');
    await userEvent.type(screen.getByTestId('comment-input'), 'mine');
    await userEvent.click(screen.getByTestId('comment-send'));

    const before = (await screen.findAllByTestId('comment-row')).length;
    await userEvent.click(await screen.findByTestId('comment-delete'));
    const banner = await screen.findByTestId('comment-error');
    expect(banner).toHaveTextContent('Không xoá được bình luận.');
    expect(screen.getAllByTestId('comment-row')).toHaveLength(before);
  });
});

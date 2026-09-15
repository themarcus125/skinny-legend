import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedClient } from '@tanstack/query-persist-client-core';

/**
 * jsdom ships no IndexedDB, so `idb-keyval` is stood up as an in-memory store here — the unit
 * under test is the wrapper (its error swallowing, its max-age handling), not Jake Archibald's
 * library. `store.fail` flips every call to a rejection, which is what a private-mode Safari or a
 * webview with storage blocked looks like from the app's side.
 */
const store = { map: new Map<string, unknown>(), fail: false };

vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => {
    if (store.fail) return Promise.reject(new DOMException('blocked', 'InvalidStateError'));
    return Promise.resolve(store.map.get(key));
  }),
  set: vi.fn((key: string, value: unknown) => {
    if (store.fail) return Promise.reject(new DOMException('blocked', 'InvalidStateError'));
    store.map.set(key, value);
    return Promise.resolve();
  }),
  del: vi.fn((key: string) => {
    if (store.fail) return Promise.reject(new DOMException('blocked', 'InvalidStateError'));
    store.map.delete(key);
    return Promise.resolve();
  }),
}));

const { PERSIST_KEY, PERSIST_MAX_AGE_MS, attachPersistence, createIdbPersister } = await import(
  './persist'
);
const { makeQueryClient, queryKeys } = await import('./query');

function snapshot(timestamp: number, queries: PersistedClient['clientState']['queries']) {
  return { buster: '', timestamp, clientState: { mutations: [], queries } } satisfies PersistedClient;
}

/** One dehydrated query, in the shape `hydrate` expects to read back. */
function dehydratedDashboard() {
  return [
    {
      queryKey: [...queryKeys.dashboard],
      queryHash: JSON.stringify(queryKeys.dashboard),
      state: {
        data: { totalPoints: 42 },
        dataUpdateCount: 1,
        dataUpdatedAt: Date.now(),
        error: null,
        errorUpdateCount: 0,
        errorUpdatedAt: 0,
        fetchFailureCount: 0,
        fetchFailureReason: null,
        fetchMeta: null,
        isInvalidated: false,
        status: 'success' as const,
        fetchStatus: 'idle' as const,
      },
    },
  ] as unknown as PersistedClient['clientState']['queries'];
}

beforeEach(() => {
  store.map.clear();
  store.fail = false;
});

describe('createIdbPersister', () => {
  it('round-trips a cached query through the persister', async () => {
    const persister = createIdbPersister('test-key');
    await persister.persistClient(snapshot(Date.now(), []));

    expect(await persister.restoreClient()).toMatchObject({ buster: '' });
  });

  it('removes what it wrote', async () => {
    const persister = createIdbPersister('test-key');
    await persister.persistClient(snapshot(Date.now(), []));
    await persister.removeClient();

    expect(await persister.restoreClient()).toBeUndefined();
  });

  it('degrades to a no-op when the store rejects', async () => {
    store.fail = true;
    const persister = createIdbPersister('test-key');

    await expect(persister.persistClient(snapshot(Date.now(), []))).resolves.toBeUndefined();
    await expect(persister.restoreClient()).resolves.toBeUndefined();
    await expect(persister.removeClient()).resolves.toBeUndefined();
  });
});

describe('attachPersistence', () => {
  it('restores a fresh snapshot into the client before it resolves', async () => {
    store.map.set(PERSIST_KEY, snapshot(Date.now(), dehydratedDashboard()));
    const client = makeQueryClient();

    await attachPersistence(client);

    expect(client.getQueryData(queryKeys.dashboard)).toEqual({ totalPoints: 42 });
  });

  it('drops a snapshot older than 24 hours', async () => {
    const stale = Date.now() - PERSIST_MAX_AGE_MS - 60 * 60 * 1000;
    store.map.set(PERSIST_KEY, snapshot(stale, dehydratedDashboard()));
    const client = makeQueryClient();

    await attachPersistence(client);

    expect(client.getQueryData(queryKeys.dashboard)).toBeUndefined();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it('degrades to a no-op persister when IndexedDB throws', async () => {
    store.fail = true;
    const client = makeQueryClient();

    await expect(attachPersistence(client)).resolves.toBeUndefined();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it('never persists mutations — a write needs a connection', async () => {
    const client = makeQueryClient();
    await attachPersistence(client);
    client.getMutationCache().build(client, { mutationFn: () => Promise.resolve('ok') });
    client.setQueryData(queryKeys.dashboard, { totalPoints: 7 });

    await vi.waitFor(() => expect(store.map.get(PERSIST_KEY)).toBeDefined());
    const written = store.map.get(PERSIST_KEY) as PersistedClient;
    expect(written.clientState.mutations).toEqual([]);
    expect(written.clientState.queries).toHaveLength(1);
  });
});

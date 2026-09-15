import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router';
import type { ApiClient, UserDto } from '@skinny/api-client';
import type { AuthPort } from '@/auth/firebase';
import { SessionProvider } from '@/auth/session';
import { ApiProvider } from '@/lib/api';
import { routes } from '@/routes';
import { render } from './intl';

export function makeUser(overrides: Partial<UserDto> = {}): UserDto {
  return {
    id: 'u1',
    firebaseUid: 'f1',
    displayName: 'Khoa',
    avatarKey: null,
    role: 'member',
    status: 'active',
    locale: 'vi',
    createdAt: '2026-09-01T00:00:00.000+07:00',
    ...overrides,
  };
}

export interface StubAuth extends AuthPort {
  /** Drives `onAuthStateChanged` from the test. */
  emit: (signedIn: boolean) => void;
  signOutCalls: number;
  signInCalls: number;
}

/** A hand-driven `AuthPort`, so the whole state machine runs without a Firebase project. */
export function stubAuthPort(startSignedIn = true): StubAuth {
  let signedIn = startSignedIn;
  let listeners: ((value: boolean) => void)[] = [];
  const port: StubAuth = {
    signOutCalls: 0,
    signInCalls: 0,
    emit(value: boolean) {
      signedIn = value;
      for (const listener of listeners) listener(value);
    },
    observe(listener) {
      listeners.push(listener);
      listener(signedIn);
      return () => {
        listeners = listeners.filter((entry) => entry !== listener);
      };
    },
    signInWithGoogle() {
      port.signInCalls += 1;
      port.emit(true);
      return Promise.resolve();
    },
    signOut() {
      port.signOutCalls += 1;
      port.emit(false);
      return Promise.resolve();
    },
    getIdToken() {
      return Promise.resolve(signedIn ? 'stub-token' : null);
    },
  };
  return port;
}

/**
 * Only the handful of `ApiClient` methods the session flow touches. Anything else throws, which
 * is louder than a silent `undefined` if a screen starts calling something unstubbed.
 */
export function stubApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return new Proxy(overrides, {
    get(target, property: string) {
      if (property in target) return target[property as keyof ApiClient];
      return () => {
        throw new Error(`stubApi: ${property}() was not stubbed`);
      };
    },
  }) as ApiClient;
}

export interface RenderAppOptions {
  client: ApiClient;
  auth: AuthPort;
  path?: string;
  /** Wrapped outside every provider — the theme test needs `ThemeProvider` there. */
  outer?: (children: ReactNode) => ReactNode;
}

/** Renders the real router, gate and all, over a stub client and a stub auth port. */
export function renderApp({ client, auth, path = '/', outer }: RenderAppOptions) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const tree = (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={client}>
        <SessionProvider auth={auth}>
          <RouterProvider router={router} />
        </SessionProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
  return { router, ...render(<>{outer ? outer(tree) : tree}</>) };
}

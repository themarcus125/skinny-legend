import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../messages/vi.json';
import { SignInCard } from './sign-in-card';

// `vi.hoisted`, not plain consts: the static `./sign-in-card` import below runs the mock
// factories before a top-level `const` is initialised, which is a TDZ error.
const { signIn, signInWithEmulatorPassword } = vi.hoisted(() => ({
  signIn: vi.fn(),
  signInWithEmulatorPassword: vi.fn(async () => {}),
}));

vi.mock('@/lib/auth/auth-context', () => ({
  useAuth: () => ({ signIn, status: 'signed-out', hasFirebaseUser: false }),
}));

// The real module reads `process.env` once at module scope, which a `vi.stubEnv` inside a test
// can no longer influence. A getter reproduces the same import shape while letting each test
// choose the host, so both the "no emulator" and the "emulator configured" branch are covered
// without reloading the component.
vi.mock('@/lib/auth/firebase', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/firebase')>('@/lib/auth/firebase');
  return {
    ...actual,
    signInWithEmulatorPassword,
    get AUTH_EMULATOR_HOST() {
      return process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? '';
    },
  };
});

function renderCard() {
  return render(
    <NextIntlClientProvider locale="vi" messages={messages}>
      <SignInCard />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('SignInCard', () => {
  it('hides the emulator form when no emulator host is configured', () => {
    renderCard();
    expect(screen.queryByTestId('emulator-form')).toBeNull();
    expect(screen.getByTestId('google-sign-in')).toBeInTheDocument();
  });

  it('signs in with email and password when the emulator host is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST', 'localhost:9099');
    renderCard();
    await userEvent.type(screen.getByTestId('emulator-email'), 'admin@example.com');
    await userEvent.type(screen.getByTestId('emulator-password'), 'password123');
    await userEvent.click(screen.getByTestId('emulator-submit'));
    expect(signInWithEmulatorPassword).toHaveBeenCalledWith('admin@example.com', 'password123');
  });
});

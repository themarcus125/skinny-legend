import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'use-intl';
import messages from '../../messages/vi.json';
import { Component } from './sign-in';

const { signInWithEmulatorPassword, emulatorHost } = vi.hoisted(() => ({
  signInWithEmulatorPassword: vi.fn(async () => {}),
  // The screen reads `authEmulatorHost` through the barrel, and Vite inlines the real one at
  // build time, so the host has to be mocked too (ruling R11) — a box each test writes before
  // rendering, read through a getter so the module's import shape stays live.
  emulatorHost: { value: '' },
}));

vi.mock('@/auth/firebase', () => ({
  signInWithEmulatorPassword,
  get authEmulatorHost() {
    return emulatorHost.value;
  },
}));
vi.mock('@/auth/session', () => ({
  SignInError: class extends Error {},
  useSession: () => ({ signIn: vi.fn(async () => {}), isWorking: false }),
}));

function renderScreen(host: string) {
  emulatorHost.value = host;
  render(
    <IntlProvider locale="vi" messages={messages}>
      <Component />
    </IntlProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  emulatorHost.value = '';
});

describe('sign-in screen', () => {
  it('shows only Google when no emulator host is configured', () => {
    renderScreen('');
    expect(screen.getByTestId('google-sign-in')).toBeInTheDocument();
    expect(screen.queryByTestId('emulator-form')).toBeNull();
  });

  it('signs in with email and password when the emulator host is configured', async () => {
    renderScreen('localhost:9099');
    await userEvent.type(screen.getByTestId('emulator-email'), 'ha@example.com');
    await userEvent.type(screen.getByTestId('emulator-password'), 'password123');
    await userEvent.click(screen.getByTestId('emulator-submit'));
    expect(signInWithEmulatorPassword).toHaveBeenCalledWith('ha@example.com', 'password123');
  });
});

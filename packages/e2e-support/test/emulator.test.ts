import { describe, expect, it } from 'vitest';
import { emulatorUrls } from '../src/emulator.js';

describe('emulatorUrls', () => {
  it('builds the Identity Toolkit and admin URLs from a host:port', () => {
    const urls = emulatorUrls('localhost:9099', 'skinny-legend');
    expect(urls.root).toBe('http://localhost:9099');
    expect(urls.signUp).toBe('http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key');
    expect(urls.signIn).toBe(
      'http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    );
    expect(urls.accounts).toBe('http://localhost:9099/emulator/v1/projects/skinny-legend/accounts');
  });

  it('accepts a host that already carries a scheme', () => {
    expect(emulatorUrls('http://127.0.0.1:9099', 'skinny-legend').root).toBe('http://127.0.0.1:9099');
  });
});

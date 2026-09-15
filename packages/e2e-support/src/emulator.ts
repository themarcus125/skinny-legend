/**
 * The emulator ignores the API key entirely, but the Identity Toolkit endpoints still require
 * the parameter to be present — hence a literal placeholder rather than a real key.
 */
const FAKE_API_KEY = 'fake-api-key';

export interface EmulatorUrls {
  root: string;
  signUp: string;
  signIn: string;
  accounts: string;
}

export function emulatorUrls(host: string, projectId: string): EmulatorUrls {
  const root = host.startsWith('http://') || host.startsWith('https://') ? host : `http://${host}`;
  const identity = `${root}/identitytoolkit.googleapis.com/v1`;
  return {
    root,
    signUp: `${identity}/accounts:signUp?key=${FAKE_API_KEY}`,
    signIn: `${identity}/accounts:signInWithPassword?key=${FAKE_API_KEY}`,
    accounts: `${root}/emulator/v1/projects/${projectId}/accounts`,
  };
}

/** Deletes every account in the emulator project. */
export async function clearEmulatorUsers({ host, projectId }: { host: string; projectId: string }): Promise<void> {
  const response = await fetch(emulatorUrls(host, projectId).accounts, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`clearEmulatorUsers failed: ${response.status} ${await response.text()}`);
  }
}

export interface EmulatorAccount {
  localId: string;
  idToken: string;
}

/** Creates one email/password account and returns its uid and a fresh ID token. */
export async function createEmulatorAccount(opts: {
  host: string;
  projectId: string;
  email: string;
  password: string;
  displayName: string;
}): Promise<EmulatorAccount> {
  const response = await fetch(emulatorUrls(opts.host, opts.projectId).signUp, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: opts.email,
      password: opts.password,
      displayName: opts.displayName,
      returnSecureToken: true,
    }),
  });
  const body = (await response.json()) as { localId?: string; idToken?: string; error?: { message?: string } };
  if (!response.ok || !body.localId || !body.idToken) {
    throw new Error(`createEmulatorAccount failed for ${opts.email}: ${body.error?.message ?? response.status}`);
  }
  return { localId: body.localId, idToken: body.idToken };
}

/** Signs an existing emulator account in and returns its ID token (used by `api.spec.ts`). */
export async function emulatorIdToken(opts: { host: string; email: string; password: string }): Promise<string> {
  const response = await fetch(emulatorUrls(opts.host, 'skinny-legend').signIn, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: opts.email, password: opts.password, returnSecureToken: true }),
  });
  const body = (await response.json()) as { idToken?: string; error?: { message?: string } };
  if (!response.ok || !body.idToken) {
    throw new Error(`emulatorIdToken failed for ${opts.email}: ${body.error?.message ?? response.status}`);
  }
  return body.idToken;
}

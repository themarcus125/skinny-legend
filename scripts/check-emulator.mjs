#!/usr/bin/env node
// Smoke check for the Firebase Auth Emulator compose service (infra/firebase-emulator).
// Run by hand after `docker compose up -d auth-emulator`:
//   node scripts/check-emulator.mjs
// Exits 0 when the banner, a signUp round-trip and the admin reset endpoint all answer.

const HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? 'localhost:9099';
const BASE = HOST.startsWith('http') ? HOST : `http://${HOST}`;
const PROJECT = process.env.FIREBASE_PROJECT_ID ?? 'skinny-legend';

function ok(label, detail) {
  console.log(`ok   ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail) {
  console.error(`fail ${label}${detail ? ` — ${detail}` : ''}`);
  process.exitCode = 1;
}

async function main() {
  // 1. Banner
  const banner = await fetch(`${BASE}/`);
  if (!banner.ok) return fail('banner', `HTTP ${banner.status}`);
  // The banner is JSON: {"authEmulator":{"ready":true,...}}
  const bannerBody = await banner.json();
  if (bannerBody?.authEmulator?.ready !== true) {
    return fail('banner', JSON.stringify(bannerBody).slice(0, 120));
  }
  ok('banner', 'authEmulator.ready=true');

  // 2. Identity Toolkit signUp round-trip
  const signUp = await fetch(
    `${BASE}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `probe-${Date.now()}@example.com`,
        password: 'password123',
        returnSecureToken: true,
      }),
    },
  );
  const signUpBody = await signUp.json();
  if (!signUp.ok || !signUpBody.localId || !signUpBody.idToken) {
    return fail('signUp', JSON.stringify(signUpBody).slice(0, 200));
  }
  ok('signUp', `localId=${signUpBody.localId}`);

  // 3. Admin reset
  const reset = await fetch(`${BASE}/emulator/v1/projects/${PROJECT}/accounts`, {
    method: 'DELETE',
  });
  if (!reset.ok) return fail('reset', `HTTP ${reset.status}`);
  ok('reset', `cleared accounts for ${PROJECT}`);
}

main().catch((err) => {
  fail('emulator unreachable', err.message);
});

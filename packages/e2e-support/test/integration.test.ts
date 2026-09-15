import { describe, expect, it } from 'vitest';
import { isPortFree } from '../src/net.js';
import { clearEmulatorUsers, createEmulatorAccount, emulatorIdToken } from '../src/emulator.js';
import { databaseUrlFor, ensureDatabase, migrateDatabase, resetDatabase, seedDatabase } from '../src/database.js';
import { createMember } from '../src/members.js';

const HOST = 'localhost:9099';
const PROJECT_ID = 'skinny-legend';
const ADMIN_URL = 'postgres://skinny:skinny@localhost:5432/skinny';

// `docker compose up -d db auth-emulator` has to be running; otherwise these cases report as
// skipped rather than failed, so `pnpm test` stays green on a machine with no Docker. The probe
// is top-level (not in `beforeAll`) because `it.skipIf` is evaluated during collection.
const up = !(await isPortFree(9099)) && !(await isPortFree(5432));

describe('e2e-support against real infrastructure', () => {
  it.skipIf(!up)('creates and clears emulator accounts', async () => {
    await clearEmulatorUsers({ host: HOST, projectId: PROJECT_ID });
    const account = await createEmulatorAccount({
      host: HOST,
      projectId: PROJECT_ID,
      email: 'support-probe@example.com',
      password: 'password123',
      displayName: 'Probe',
    });
    expect(account.localId).toMatch(/.+/);
    expect(await emulatorIdToken({ host: HOST, email: 'support-probe@example.com', password: 'password123' })).toMatch(
      /\./,
    );
    await clearEmulatorUsers({ host: HOST, projectId: PROJECT_ID });
    await expect(
      emulatorIdToken({ host: HOST, email: 'support-probe@example.com', password: 'password123' }),
    ).rejects.toThrow();
  });

  it.skipIf(!up)(
    'creates, migrates, seeds and resets skinny_e2e_support',
    async () => {
      const url = await ensureDatabase(ADMIN_URL, 'skinny_e2e_support');
      expect(url).toBe(databaseUrlFor(ADMIN_URL, 'skinny_e2e_support'));
      await migrateDatabase(url);
      await seedDatabase(url);
      await clearEmulatorUsers({ host: HOST, projectId: PROJECT_ID });
      const member = await createMember({
        databaseUrl: url,
        host: HOST,
        projectId: PROJECT_ID,
        name: 'Hà',
        email: 'ha-support@example.com',
        password: 'password123',
        status: 'active',
      });
      expect(member.userId).toMatch(/^[0-9a-f-]{36}$/);
      await resetDatabase(url);
      // The reset clears users but must leave the seeded challenge behind.
      const { default: postgres } = await import('postgres');
      const sql = postgres(url, { max: 1 });
      try {
        expect((await sql`select count(*)::int as n from users`)[0]!.n).toBe(0);
        expect((await sql`select count(*)::int as n from challenges`)[0]!.n).toBeGreaterThan(0);
        expect((await sql`select count(*)::int as n from scoring_rules`)[0]!.n).toBe(3);
      } finally {
        await sql.end();
      }
    },
    120_000,
  );
});

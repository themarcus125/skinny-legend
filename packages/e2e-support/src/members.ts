import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { schema } from '@skinny/shared';
import { createEmulatorAccount } from './emulator.js';

export interface CreateMemberOptions {
  databaseUrl: string;
  host: string;
  projectId: string;
  name: string;
  email: string;
  password: string;
  status?: 'pending' | 'active' | 'disabled';
  role?: 'member' | 'admin';
  locale?: 'vi' | 'en';
}

export interface Member {
  uid: string;
  email: string;
  password: string;
  name: string;
  /** The `users.id` primary key, for asserting against the API and the admin console. */
  userId: string;
}

/**
 * Creates the emulator account and the matching `users` row in one call, so a spec never has to
 * sign in just to bring a row into existence. The row is inserted directly rather than through
 * `POST /auth/session` because the status/role/locale are part of the fixture.
 */
export async function createMember(opts: CreateMemberOptions): Promise<Member> {
  const account = await createEmulatorAccount({
    host: opts.host,
    projectId: opts.projectId,
    email: opts.email,
    password: opts.password,
    displayName: opts.name,
  });
  const sql = postgres(opts.databaseUrl, { max: 1 });
  try {
    const db = drizzle(sql, { schema });
    const [row] = await db
      .insert(schema.users)
      .values({
        firebaseUid: account.localId,
        displayName: opts.name,
        status: opts.status ?? 'active',
        role: opts.role ?? 'member',
        locale: opts.locale ?? 'vi',
      })
      .onConflictDoUpdate({
        target: schema.users.firebaseUid,
        set: {
          displayName: opts.name,
          status: opts.status ?? 'active',
          role: opts.role ?? 'member',
          locale: opts.locale ?? 'vi',
        },
      })
      .returning();
    if (!row) {
      const [existing] = await db.select().from(schema.users).where(eq(schema.users.firebaseUid, account.localId));
      if (!existing) throw new Error(`createMember: no users row for ${opts.email}`);
      return { uid: account.localId, email: opts.email, password: opts.password, name: opts.name, userId: existing.id };
    }
    return { uid: account.localId, email: opts.email, password: opts.password, name: opts.name, userId: row.id };
  } finally {
    await sql.end();
  }
}

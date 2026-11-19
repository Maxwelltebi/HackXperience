// Integration tests against the local database (pnpm db:start && pnpm db:reset).
import { CIREN_ORG_ID } from '@hx/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { audit } from './audit';
import { closeSql, getSql, tx } from './client';
import {
  deletePushToken,
  getMe,
  getPublicProfile,
  updateProfile,
  upsertPushToken,
} from './identity';
import { createTestUser, deleteTestUser } from './testing';

const sql = getSql();
const created: string[] = [];

async function newUser(options?: Parameters<typeof createTestUser>[1]) {
  const user = await createTestUser(sql, options);
  created.push(user.id);
  return user;
}

afterAll(async () => {
  for (const id of created) await deleteTestUser(sql, id);
  await closeSql();
});

describe('on_auth_user_created trigger', () => {
  it('creates exactly one users row and one profiles row per auth user', async () => {
    const { id, email } = await newUser({ name: 'Ama Mensah' });

    const users = await sql`select id, email, name from users where id = ${id}`;
    const profiles =
      await sql`select user_id, timezone, email_reminders from profiles where user_id = ${id}`;

    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email, name: 'Ama Mensah' });
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ timezone: 'UTC', email_reminders: true });
  });

  it('lowercases the email and fills github_username for GitHub sign-ins', async () => {
    const { id } = await newUser({
      email: `Mixed.Case-${crypto.randomUUID()}@Example.test`,
      provider: 'github',
      userName: 'amamensah',
    });
    const [row] = await sql`
      select u.email, p.github_username from users u join profiles p on p.user_id = u.id
      where u.id = ${id}
    `;
    expect(row?.email).toBe(String(row?.email).toLowerCase());
    expect(row?.github_username).toBe('amamensah');
  });

  it('does not set github_username for Google sign-ins', async () => {
    const { id } = await newUser({ provider: 'google', userName: 'someone' });
    const [row] = await sql`select github_username from profiles where user_id = ${id}`;
    expect(row?.github_username).toBeNull();
  });
});

describe('schema', () => {
  it('seeds the CIReN organization', async () => {
    const [org] = await sql`select name, slug from organizations where id = ${CIREN_ORG_ID}`;
    expect(org).toEqual({ name: 'CIReN', slug: 'ciren' });
  });

  it('has row-level security on every public table', async () => {
    const tables = await sql<{ relname: string; relrowsecurity: boolean }[]>`
      select c.relname, c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    `;
    expect(tables.length).toBeGreaterThan(0);
    expect(tables.filter((t) => !t.relrowsecurity).map((t) => t.relname)).toEqual([]);
  });

  it('has no row-level security policies on public tables', async () => {
    const policies = await sql`select tablename from pg_policies where schemaname = 'public'`;
    expect(policies).toHaveLength(0);
  });
});

describe('identity queries', () => {
  it('updates name and profile fields together and reads them back', async () => {
    const { id } = await newUser();
    const me = await tx((t) =>
      updateProfile(t, id, { name: 'Efua Owusu', timezone: 'Africa/Accra', school: 'KNUST' }),
    );
    expect(me?.user.name).toBe('Efua Owusu');
    expect(me?.profile).toMatchObject({ timezone: 'Africa/Accra', school: 'KNUST', bio: null });
    expect(await getMe(sql, id)).toEqual(me);
  });

  it('returns null for an unknown user', async () => {
    expect(await getMe(sql, crypto.randomUUID())).toBeNull();
    expect(await getPublicProfile(sql, crypto.randomUUID())).toBeNull();
  });

  it('moves a push token to the user who registers it last, and deletes only your own', async () => {
    const a = await newUser();
    const b = await newUser();
    const token = `ExponentPushToken[${crypto.randomUUID()}]`;

    await upsertPushToken(sql, a.id, { token, platform: 'android' });
    await upsertPushToken(sql, b.id, { token, platform: 'android' });
    const [owner] = await sql`select user_id from push_tokens where token = ${token}`;
    expect(owner?.user_id).toBe(b.id);

    await deletePushToken(sql, a.id, token);
    expect(await sql`select 1 from push_tokens where token = ${token}`).toHaveLength(1);
    await deletePushToken(sql, b.id, token);
    expect(await sql`select 1 from push_tokens where token = ${token}`).toHaveLength(0);
  });
});

describe('tx and audit', () => {
  it('writes an audit row inside a transaction', async () => {
    const { id } = await newUser();
    const entityId = crypto.randomUUID();
    await tx((t) =>
      audit(t, {
        actorId: id,
        action: 'test.audit',
        entityType: 'test',
        entityId,
        before: { a: 1 },
        after: { a: 2 },
      }),
    );
    const [row] =
      await sql`select actor_id, action, before, after from audit_log where entity_id = ${entityId}`;
    expect(row).toEqual({ actor_id: id, action: 'test.audit', before: { a: 1 }, after: { a: 2 } });
    await sql`delete from audit_log where entity_id = ${entityId}`;
  });

  it('rolls back every write when the callback throws', async () => {
    const { id } = await newUser();
    await expect(
      tx(async (t) => {
        await t`update users set name = 'Rolled back' where id = ${id}`;
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const [row] = await sql`select name from users where id = ${id}`;
    expect(row?.name).toBe('Test User');
  });
});

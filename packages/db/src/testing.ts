// Helpers for integration tests. Never import from application code.
import { randomUUID } from 'node:crypto';
import type { ISql } from './client';

export interface TestUserOptions {
  name?: string;
  email?: string;
  provider?: 'google' | 'github';
  userName?: string;
}

/**
 * Insert an auth user the way Supabase Auth does after an OAuth sign-in, so the
 * on_auth_user_created trigger runs. Returns the new user's id and email.
 */
export async function createTestUser(
  sql: ISql,
  options: TestUserOptions = {},
): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  const email = options.email ?? `test-${id}@example.test`;
  const meta: Record<string, string> = { full_name: options.name ?? 'Test User' };
  if (options.userName) meta.user_name = options.userName;

  await sql`
    insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
    values (
      ${id},
      ${email},
      ${sql.json(meta)},
      ${sql.json({ provider: options.provider ?? 'google' })}
    )
  `;
  return { id, email };
}

/**
 * Remove a test user and the audit rows they wrote (audit_log.actor_id has no cascade).
 * Cascades to users, profiles, and push_tokens.
 */
export async function deleteTestUser(sql: ISql, id: string): Promise<void> {
  await sql`delete from audit_log where actor_id = ${id}`;
  await sql`delete from auth.users where id = ${id}`;
}

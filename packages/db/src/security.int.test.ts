// Standing checks from the Phase 7 security review (Agent rule 6).
import { afterAll, describe, expect, it } from 'vitest';
import { closeSql, getSql } from './client';

const sql = getSql();
afterAll(() => closeSql());

describe('database security', () => {
  it('has row-level security on every public table', async () => {
    const open = await sql<{ table: string }[]>`
      select c.relname as table from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    `;
    expect(open).toEqual([]);
  });

  it('has no client policies on public tables', async () => {
    const policies = await sql<{ table: string; policy: string }[]>`
      select tablename as table, policyname as policy from pg_policies where schemaname = 'public'
    `;
    expect(policies).toEqual([]);
  });

  it('keeps the channel helpers out of reach of anonymous callers', async () => {
    const [row] = await sql<[{ anon: boolean }]>`
      select has_schema_privilege('anon', 'hx_private', 'usage')
             and has_function_privilege('anon', 'hx_private.can_receive(text, uuid)', 'execute') as anon
    `;
    expect(row.anon).toBe(false);
  });
});

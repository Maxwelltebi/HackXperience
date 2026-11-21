import postgres, { type ISql, type Sql, type TransactionSql } from 'postgres';

export type { ISql, Sql, TransactionSql };
export { PostgresError } from 'postgres';

let client: Sql | undefined;

/**
 * The shared postgres.js client on DATABASE_URL, created on first use.
 * Production uses the Supabase pooler (Supavisor) in transaction mode, which:
 * - cannot keep named prepared statements, so `prepare` is off;
 * - hangs when several queries are pipelined on one connection: the database waits for the
 *   rest of a query that never comes, and that pooled connection is lost. With more parallel
 *   queries than connections (getStandings runs six at once), pages loaded forever and the
 *   whole app stopped answering (21 Nov 2026). `max_pipeline: 1` sends one query per
 *   connection at a time; extra queries wait for a free connection instead.
 */
export function getSql(): Sql {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  client = postgres(url, {
    prepare: false,
    max_pipeline: 1,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 10,
    connection: { application_name: 'hackxperience', TimeZone: 'UTC' },
    onnotice: () => {},
  });
  return client;
}

/** Close the shared client. Used by tests and scripts. */
export async function closeSql(): Promise<void> {
  const current = client;
  client = undefined;
  await current?.end({ timeout: 5 });
}

/**
 * Run `fn` in one transaction. Commits when it resolves, rolls back when it throws.
 * Never make a network call inside `fn` (Agent rule 9).
 */
export async function tx<T>(
  fn: (sql: TransactionSql) => Promise<T>,
  sql: Sql = getSql(),
): Promise<T> {
  return (await sql.begin(fn)) as T;
}

/** Postgres error codes the API maps to its own errors. */
export const PG_ERROR = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  checkViolation: '23514',
  lockNotAvailable: '55P03',
  deadlock: '40P01',
  serializationFailure: '40001',
} as const;

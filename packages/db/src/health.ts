import type { ISql } from './client';

/** `select 1`. Throws if the database cannot be reached. */
export async function pingDatabase(sql: ISql): Promise<void> {
  await sql`select 1`;
}

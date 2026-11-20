import type { ISql } from './client';

/**
 * Records bounced or complained addresses so the outbox never emails them again.
 * Returns how many addresses were new.
 */
export async function addSuppressions(
  sql: ISql,
  emails: string[],
  reason: 'bounce' | 'complaint',
): Promise<number> {
  const unique = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  if (unique.length === 0) return 0;
  const rows = await sql`
    insert into email_suppressions (email, reason)
    select unnest(${unique}::text[]), ${reason}
    on conflict (email) do nothing
    returning email
  `;
  return rows.length;
}

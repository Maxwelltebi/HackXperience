import type { ISql } from './client';
import type { Json } from './database.types';

export interface AuditEntry {
  eventId?: string | null;
  actorId: string | null;
  /** What happened, e.g. "application.decided" or "team.member_removed". */
  action: string;
  /** The kind of row changed, e.g. "application". */
  entityType: string;
  entityId?: string | null;
  before?: Json;
  after?: Json;
}

/**
 * Write one audit_log row. Call it inside the same transaction as the change,
 * so the row exists exactly when the change does (Agent rule 15).
 */
export async function audit(sql: ISql, entry: AuditEntry): Promise<void> {
  await sql`
    insert into audit_log (event_id, actor_id, action, entity_type, entity_id, before, after)
    values (
      ${entry.eventId ?? null},
      ${entry.actorId},
      ${entry.action},
      ${entry.entityType},
      ${entry.entityId ?? null},
      ${toJson(sql, entry.before)},
      ${toJson(sql, entry.after)}
    )
  `;
}

/** jsonb parameter, or SQL null. Objects go through sql.json so they are not double-encoded. */
function toJson(sql: ISql, value: Json | undefined) {
  return value === undefined || value === null ? null : sql.json(value);
}

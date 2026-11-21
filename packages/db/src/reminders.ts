import { dueReminder } from '@hx/core';
import type { ISql } from './client';

/** Outbox template name for deadline reminders. */
export const SUBMISSION_REMINDER_TEMPLATE = 'submission_reminder';

/**
 * Tick step "reminders" (build plan Phase 4 item 8). For each open event whose deadline is
 * within 24 hours, queues one email per member of every team that hasn't submitted (a team
 * with no submission yet counts too), for members with email_reminders on. The dedupe key
 * `reminder:{eventId}:{userId}:{24h|1h}` means each person gets each reminder once.
 * The email is re-checked just before sending (outbox.ts), so submitting in between cancels it.
 */
export async function enqueueDeadlineReminders(sql: ISql): Promise<number> {
  const events = await sql<{ id: string; submission_deadline: Date; now: Date }[]>`
    select id, submission_deadline, now() as now from events
    where deleted_at is null and status in ('published', 'live')
      and submissions_locked_at is null
      and submission_deadline > now() and submission_deadline <= now() + interval '24 hours'
  `;
  let queued = 0;
  for (const event of events) {
    const kind = dueReminder(event.submission_deadline, event.now);
    if (!kind) continue;
    const rows = await sql`
      insert into notification_outbox (user_id, channel, template, payload, dedupe_key, send_after)
      select m.user_id, 'email', ${SUBMISSION_REMINDER_TEMPLATE},
             jsonb_build_object('event_id', ${event.id}::uuid, 'team_id', t.id, 'kind', ${kind}::text),
             'reminder:' || ${event.id}::text || ':' || m.user_id || ':' || ${kind}::text,
             now()
      from teams t
      join team_members m on m.team_id = t.id
      join profiles p on p.user_id = m.user_id and p.email_reminders
      left join submissions s on s.team_id = t.id
      where t.event_id = ${event.id} and t.deleted_at is null
        and (s.id is null or (s.status = 'draft' and s.deleted_at is null))
      on conflict (dedupe_key) do nothing
      returning id
    `;
    queued += rows.length;
  }
  return queued;
}

import { dueEventAlerts } from '@hx/core';
import { renderEventAlert, type RenderedEmail } from '@hx/emails';
import { EVENT_ALERT_KINDS, formatDateTime, type EventAlertKind, type EventMode } from '@hx/shared';
import type { ISql } from './client';

/** Outbox template for event alerts (R42). Rows have no user_id: subscribers need no account. */
export const EVENT_ALERT_TEMPLATE = 'event_alert';

const MODE_LABEL: Record<EventMode, string> = {
  in_person: 'In person',
  virtual: 'Online',
  hybrid: 'In person and online',
};

const isAlertKind = (value: string): value is EventAlertKind =>
  (EVENT_ALERT_KINDS as readonly string[]).includes(value);

/**
 * POST /alerts: signs an address up, or back up after unsubscribing. No confirmation step, by
 * the product owner's choice (R42). Says nothing about whether the address was already there.
 */
export async function subscribeToAlerts(sql: ISql, email: string): Promise<void> {
  await sql`
    insert into alert_subscribers (email) values (${email.toLowerCase()})
    on conflict (email) do update set unsubscribed_at = null
  `;
}

/** POST /alerts/unsubscribe. Alerts already queued are dropped at send time. */
export async function unsubscribeFromAlerts(sql: ISql, token: string): Promise<boolean> {
  const rows = await sql`
    update alert_subscribers set unsubscribed_at = coalesce(unsubscribed_at, now())
    where unsubscribe_token = ${token}
    returning id
  `;
  return rows.length > 0;
}

/**
 * Queues one email per current subscriber, once per event and kind (event_alerts_sent), in the
 * caller's transaction (Agent rule 16). "Closing soon" skips people who have already applied.
 * Returns the number of emails queued.
 */
export async function queueEventAlert(
  sql: ISql,
  eventId: string,
  kind: EventAlertKind,
): Promise<number> {
  const [run] = await sql`
    insert into event_alerts_sent (event_id, kind) values (${eventId}, ${kind})
    on conflict do nothing
    returning kind
  `;
  if (!run) return 0;
  const rows = await sql`
    insert into notification_outbox (user_id, channel, template, payload, dedupe_key)
    select null, 'email', ${EVENT_ALERT_TEMPLATE},
           jsonb_build_object('event_id', ${eventId}::uuid, 'subscriber_id', s.id, 'kind', ${kind}::text),
           'alert:' || ${kind}::text || ':' || ${eventId}::text || ':' || s.id
    from alert_subscribers s
    where s.unsubscribed_at is null
      ${
        kind === 'closing_soon'
          ? sql`and not exists (
              select 1 from applications a join users u on u.id = a.user_id
              where a.event_id = ${eventId} and lower(u.email) = s.email
            )`
          : sql``
      }
    on conflict (dedupe_key) do nothing
    returning id
  `;
  return rows.length;
}

/**
 * Called when an event goes from draft to published, in the same transaction. If applications
 * are already open, the "published" email says so, and no separate "applications open" email
 * follows.
 */
export async function queuePublishedAlerts(
  sql: ISql,
  event: { id: string; applications_open_at: Date | null; applications_close_at: Date | null },
  now: Date,
): Promise<number> {
  const queued = await queueEventAlert(sql, event.id, 'published');
  const open = event.applications_open_at;
  const close = event.applications_close_at;
  if (open && close && open <= now && now < close) {
    await sql`
      insert into event_alerts_sent (event_id, kind) values (${event.id}, 'applications_open')
      on conflict do nothing
    `;
  }
  return queued;
}

/**
 * Tick step "event alerts" (R42): "applications open" and "closing soon" for published events
 * whose application window is open now. Timing rules: dueEventAlerts in @hx/core.
 */
export async function enqueueEventAlerts(sql: ISql): Promise<number> {
  const events = await sql<
    {
      id: string;
      applications_open_at: Date;
      applications_close_at: Date;
      now: Date;
      sent: Record<string, string> | null;
    }[]
  >`
    select e.id, e.applications_open_at, e.applications_close_at, now() as now,
           (select jsonb_object_agg(s.kind, s.queued_at) from event_alerts_sent s
            where s.event_id = e.id) as sent
    from events e
    where e.deleted_at is null and e.status in ('published', 'live')
      and e.applications_open_at <= now() and e.applications_close_at > now()
  `;
  let queued = 0;
  for (const event of events) {
    const sent: Partial<Record<EventAlertKind, Date>> = {};
    for (const [kind, at] of Object.entries(event.sent ?? {})) {
      if (isAlertKind(kind)) sent[kind] = new Date(at);
    }
    const due = dueEventAlerts(
      {
        applicationsOpenAt: event.applications_open_at,
        applicationsCloseAt: event.applications_close_at,
        sent,
      },
      event.now,
    );
    for (const kind of due) queued += await queueEventAlert(sql, event.id, kind);
  }
  return queued;
}

export type PreparedAlert =
  | { kind: 'send'; to: string; email: RenderedEmail }
  | { kind: 'superseded' }
  | { kind: 'failed'; reason: string };

/**
 * Re-checked just before sending: superseded if they unsubscribed, the event was deleted or
 * moved on, applications are no longer open, or (for "closing soon") they have since applied.
 */
export async function prepareEventAlert(
  sql: ISql,
  payload: Record<string, unknown>,
  appUrl: string,
): Promise<PreparedAlert> {
  const kind = String(payload.kind);
  if (!isAlertKind(kind)) return { kind: 'failed', reason: `unknown alert ${kind}` };
  const [row] = await sql<
    [
      {
        email: string;
        token: string;
        subscribed: boolean;
        name: string;
        slug: string;
        mode: EventMode;
        location: string | null;
        timezone: string;
        status: string;
        deleted: boolean;
        applications_open_at: Date | null;
        applications_close_at: Date | null;
        starts_at: Date;
        now: Date;
        applied: boolean;
      }?,
    ]
  >`
    select s.email, s.unsubscribe_token as token, s.unsubscribed_at is null as subscribed,
           e.name, e.slug, e.mode::text as mode, e.location, e.timezone, e.status::text as status,
           e.deleted_at is not null as deleted,
           e.applications_open_at, e.applications_close_at, e.starts_at, now() as now,
           exists (select 1 from applications a join users u on u.id = a.user_id
                   where a.event_id = e.id and lower(u.email) = s.email) as applied
    from alert_subscribers s
    join events e on e.id = ${String(payload.event_id)}
    where s.id = ${String(payload.subscriber_id)}
  `;
  if (!row?.subscribed || row.deleted || (row.status !== 'published' && row.status !== 'live')) {
    return { kind: 'superseded' };
  }
  const open = row.applications_open_at;
  const close = row.applications_close_at;
  const openNow = open !== null && close !== null && open <= row.now && row.now < close;
  if (kind === 'applications_open' && !openNow) return { kind: 'superseded' };
  if (kind === 'closing_soon' && (!openNow || row.applied)) return { kind: 'superseded' };

  const at = (date: Date | null) =>
    date ? formatDateTime(date.toISOString(), row.timezone) : null;
  return {
    kind: 'send',
    to: row.email,
    email: renderEventAlert({
      kind,
      eventName: row.name,
      where: [MODE_LABEL[row.mode], row.location].filter(Boolean).join(' · '),
      applicationsOpen: at(open),
      applicationsClose: at(close),
      applicationsOpenNow: openNow,
      startsAt: at(row.starts_at) ?? '',
      eventUrl: `${appUrl}/events/${row.slug}`,
      unsubscribeUrl: `${appUrl}/alerts/unsubscribe?token=${row.token}`,
    }),
  };
}

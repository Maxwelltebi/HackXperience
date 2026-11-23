// Event alerts (R42) against the local database: queued on publish and by the tick, re-checked
// at send time.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enqueueEventAlerts, subscribeToAlerts, unsubscribeFromAlerts } from './alerts';
import { closeSql, getSql, tx } from './client';
import { changeEventStatus } from './events';
import { processOutbox, type EmailSender } from './outbox';
import { testData } from './testing';

const sql = getSql();
const data = testData(sql);
const appUrl = 'https://hack.ciren.network';
let ownerId: string;

beforeAll(async () => {
  ownerId = (await data.user('Owner')).id;
});

afterAll(async () => {
  await data.cleanup();
  await closeSql();
});

function fakeSender() {
  const sent: { to: string; subject: string; text: string }[] = [];
  const send: EmailSender = async (message) => {
    sent.push({ to: message.to, subject: message.subject, text: message.text });
    return { messageId: `msg-${sent.length}` };
  };
  return { sent, send };
}

async function queuedFor(eventId: string, subscriberIds: string[]) {
  return sql<{ kind: string; subscriber_id: string }[]>`
    select payload->>'kind' as kind, payload->>'subscriber_id' as subscriber_id
    from notification_outbox
    where template = 'event_alert' and payload->>'event_id' = ${eventId}
      and payload->>'subscriber_id' = any(${subscriberIds}::text[])
    order by kind
  `;
}

describe('signing up', () => {
  it('stores the address once, in lower case, and signs it back up after unsubscribing', async () => {
    const subscriber = await data.alertSubscriber();
    await subscribeToAlerts(sql, subscriber.email.toUpperCase());
    const rows = await sql`select 1 from alert_subscribers where email = ${subscriber.email}`;
    expect(rows).toHaveLength(1);

    expect(await unsubscribeFromAlerts(sql, subscriber.unsubscribe_token)).toBe(true);
    await subscribeToAlerts(sql, subscriber.email);
    const [row] = await sql<[{ unsubscribed_at: Date | null }]>`
      select unsubscribed_at from alert_subscribers where id = ${subscriber.id}
    `;
    expect(row.unsubscribed_at).toBeNull();
    expect(await unsubscribeFromAlerts(sql, crypto.randomUUID())).toBe(false);
  });
});

describe('publishing an event', () => {
  it('queues one "published" email per subscriber, once, and sends it', async () => {
    const a = await data.alertSubscriber();
    const b = await data.alertSubscriber();
    const gone = await data.alertSubscriber();
    await unsubscribeFromAlerts(sql, gone.unsubscribe_token);
    const event = await data.event(ownerId, { status: 'draft', name: 'Alert Hackathon' });

    await tx((t) => changeEventStatus(t, event.id, ownerId, 'published'));
    const ids = [a.id, b.id, gone.id];
    expect(await queuedFor(event.id, ids)).toEqual(
      expect.arrayContaining([
        { kind: 'published', subscriber_id: a.id },
        { kind: 'published', subscriber_id: b.id },
      ]),
    );
    expect(await queuedFor(event.id, ids)).toHaveLength(2);

    // Applications were already open, so the tick sends no separate "applications open" email.
    await enqueueEventAlerts(sql);
    expect(await queuedFor(event.id, ids)).toHaveLength(2);

    // Back to draft and published again: no second round.
    await tx((t) => changeEventStatus(t, event.id, ownerId, 'draft'));
    await tx((t) => changeEventStatus(t, event.id, ownerId, 'published'));
    expect(await queuedFor(event.id, ids)).toHaveLength(2);

    // b unsubscribes before the send: theirs is dropped.
    await unsubscribeFromAlerts(sql, b.unsubscribe_token);
    const sender = fakeSender();
    const result = await processOutbox(
      sql,
      { sendEmail: sender.send, appUrl },
      { eventIds: [event.id] },
    );
    // Other subscribers made earlier in this file get theirs too; only a's and b's matter here.
    expect(result.superseded).toBe(1);
    const mine = sender.sent.filter((m) => m.to === a.email || m.to === b.email);
    expect(mine.map((m) => m.to)).toEqual([a.email]);
    expect(mine[0]?.subject).toBe('New CIReN hackathon: Alert Hackathon');
    expect(mine[0]?.text).toContain('Applications are open until');
    expect(mine[0]?.text).toContain(`${appUrl}/alerts/unsubscribe?token=${a.unsubscribe_token}`);
  });
});

describe('the tick', () => {
  it('queues "applications open" once for a published event in its window', async () => {
    const a = await data.alertSubscriber();
    const event = await data.event(ownerId);
    await enqueueEventAlerts(sql);
    await enqueueEventAlerts(sql);
    expect(await queuedFor(event.id, [a.id])).toEqual([
      { kind: 'applications_open', subscriber_id: a.id },
    ]);
  });

  it('queues "closing soon" in the last 48 hours, skipping people who applied', async () => {
    const applicant = await data.user('Applicant');
    const applied = await data.alertSubscriber(applicant.email);
    const waiting = await data.alertSubscriber();
    const event = await data.event(ownerId);
    await sql`update events set applications_close_at = now() + interval '30 hours' where id = ${event.id}`;
    await sql`
      insert into event_alerts_sent (event_id, kind, queued_at)
      values (${event.id}, 'applications_open', now() - interval '3 days')
    `;
    await sql`insert into applications (event_id, user_id) values (${event.id}, ${applicant.id})`;

    await enqueueEventAlerts(sql);
    expect(await queuedFor(event.id, [applied.id, waiting.id])).toEqual([
      { kind: 'closing_soon', subscriber_id: waiting.id },
    ]);

    const sender = fakeSender();
    await processOutbox(sql, { sendEmail: sender.send, appUrl }, { eventIds: [event.id] });
    expect(sender.sent.filter((m) => m.to === applied.email)).toEqual([]);
    expect(sender.sent.filter((m) => m.to === waiting.email).map((m) => m.subject)).toEqual([
      'Applications for Test Hackathon close in 2 days',
    ]);
  });

  it('drops "applications open" if applications have closed by send time', async () => {
    const a = await data.alertSubscriber();
    const event = await data.event(ownerId);
    await enqueueEventAlerts(sql);
    await sql`update events set applications_close_at = now() - interval '1 minute' where id = ${event.id}`;
    const sender = fakeSender();
    const result = await processOutbox(
      sql,
      { sendEmail: sender.send, appUrl },
      { eventIds: [event.id] },
    );
    expect(result.sent).toBe(0);
    expect(result.superseded).toBeGreaterThanOrEqual(1);
    expect(sender.sent).toEqual([]);
    expect(await queuedFor(event.id, [a.id])).toHaveLength(1);
  });
});

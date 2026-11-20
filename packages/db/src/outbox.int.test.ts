// Outbox and decision guarantees against the local database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decideApplications } from './applications';
import { closeSql, getSql, tx } from './client';
import { claimOutbox, processOutbox, recoverStuckOutbox, type EmailSender } from './outbox';
import { addSuppressions } from './suppressions';
import { testData } from './testing';
import { runTick, TICK_LOCK_KEY } from './tick';

const sql = getSql();
const data = testData(sql);
let ownerId: string;

beforeAll(async () => {
  ownerId = (await data.user('Owner')).id;
});

afterAll(async () => {
  await data.cleanup();
  await closeSql();
});

interface Sent {
  to: string;
  subject: string;
}

function fakeSender(options: { delayMs?: number; fail?: boolean } = {}) {
  const sent: Sent[] = [];
  const send: EmailSender = async (message) => {
    if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
    if (options.fail) throw new Error(`SES refused ${message.to}`);
    sent.push({ to: message.to, subject: message.subject });
    return { messageId: `msg-${sent.length}` };
  };
  return { sent, send };
}

/** An event with `count` applicants who each applied. */
async function eventWithApplicants(count: number) {
  const event = await data.event(ownerId);
  const applicants = [];
  for (let i = 0; i < count; i++) {
    const user = await data.user(`Applicant ${i}`);
    const [app] = await sql<[{ id: string }]>`
      insert into applications (event_id, user_id) values (${event.id}, ${user.id}) returning id
    `;
    applicants.push({ userId: user.id, email: user.email, applicationId: app.id });
  }
  return { event, applicants };
}

/** Skip the 10-minute wait: make this event's pending rows due now. */
async function makeDue(eventId: string) {
  await sql`
    update notification_outbox set send_after = now() - interval '1 second'
    where payload->>'event_id' = ${eventId} and status = 'pending'
  `;
}

const appUrl = 'https://hack.test';

function first<T>(items: T[]): T {
  const [item] = items;
  if (item === undefined) throw new Error('expected at least one item');
  return item;
}

describe('bulk decisions', () => {
  it('50 decisions create 50 audit rows and 50 outbox rows that wait 10 minutes', async () => {
    const { event, applicants } = await eventWithApplicants(50);
    const ids = applicants.map((a) => a.applicationId);

    const result = await tx((t) => decideApplications(t, event.id, ownerId, ids, 'accepted'));
    expect(result.updated.sort()).toEqual([...ids].sort());

    const [audits] = await sql<[{ n: number }]>`
      select count(*)::int as n from audit_log
      where event_id = ${event.id} and action = 'application.decided'
    `;
    expect(audits.n).toBe(50);

    const rows = await sql<{ dedupe_key: string; wait: number }[]>`
      select dedupe_key, extract(epoch from send_after - now())::float as wait
      from notification_outbox where payload->>'event_id' = ${event.id}
    `;
    expect(rows).toHaveLength(50);
    for (const row of rows) {
      expect(row.dedupe_key).toMatch(/^decision:[0-9a-f-]{36}:accepted$/);
      expect(row.wait).toBeGreaterThan(9 * 60);
      expect(row.wait).toBeLessThanOrEqual(10 * 60);
    }
  });

  it('repeating a decision changes nothing and queues nothing new', async () => {
    const { event, applicants } = await eventWithApplicants(1);
    const id = first(applicants).applicationId;
    await tx((t) => decideApplications(t, event.id, ownerId, [id], 'waitlisted'));
    const again = await tx((t) => decideApplications(t, event.id, ownerId, [id], 'waitlisted'));
    expect(again).toEqual({ updated: [], unchanged: [id], skipped: [] });
    const rows =
      await sql`select 1 from notification_outbox where payload->>'event_id' = ${event.id}`;
    expect(rows).toHaveLength(1);
  });
});

describe('undo window', () => {
  it('a decision changed within 10 minutes sends only the latest', async () => {
    const { event, applicants } = await eventWithApplicants(1);
    const { applicationId, userId, email } = first(applicants);
    await tx((t) => decideApplications(t, event.id, ownerId, [applicationId], 'accepted'));
    await tx((t) => decideApplications(t, event.id, ownerId, [applicationId], 'rejected'));
    await makeDue(event.id);

    const sender = fakeSender();
    const result = await processOutbox(
      sql,
      { sendEmail: sender.send, appUrl },
      { userIds: [userId] },
    );

    expect(result).toMatchObject({ claimed: 2, sent: 1, superseded: 1 });
    expect(sender.sent).toEqual([{ to: email, subject: 'Your application to Test Hackathon' }]);
    const statuses = await sql<{ key: string; status: string }[]>`
      select split_part(dedupe_key, ':', 3) as key, status::text from notification_outbox
      where user_id = ${userId} order by key
    `;
    expect(statuses).toEqual([
      { key: 'accepted', status: 'superseded' },
      { key: 'rejected', status: 'sent' },
    ]);
  });

  it('changing back to the first decision sends that one, once', async () => {
    const { event, applicants } = await eventWithApplicants(1);
    const { applicationId, userId } = first(applicants);
    for (const status of ['accepted', 'rejected', 'accepted'] as const) {
      await tx((t) => decideApplications(t, event.id, ownerId, [applicationId], status));
    }
    await makeDue(event.id);
    const sender = fakeSender();
    await processOutbox(sql, { sendEmail: sender.send, appUrl }, { userIds: [userId] });
    expect(sender.sent.map((s) => s.subject)).toEqual(["You're in: Test Hackathon"]);
  });

  it('revives a superseded email when the decision returns to it later', async () => {
    const { event, applicants } = await eventWithApplicants(1);
    const { applicationId, userId } = first(applicants);
    await tx((t) => decideApplications(t, event.id, ownerId, [applicationId], 'accepted'));
    await tx((t) => decideApplications(t, event.id, ownerId, [applicationId], 'rejected'));
    await makeDue(event.id);
    await processOutbox(sql, { sendEmail: fakeSender().send, appUrl }, { userIds: [userId] });

    // Later the organizer accepts after all: the superseded "accepted" row comes back.
    await tx((t) => decideApplications(t, event.id, ownerId, [applicationId], 'accepted'));
    await makeDue(event.id);
    const sender = fakeSender();
    await processOutbox(sql, { sendEmail: sender.send, appUrl }, { userIds: [userId] });
    expect(sender.sent.map((s) => s.subject)).toEqual(["You're in: Test Hackathon"]);
  });
});

describe('workers', () => {
  it('two workers running at once never send the same row', async () => {
    const { event, applicants } = await eventWithApplicants(30);
    await tx((t) =>
      decideApplications(
        t,
        event.id,
        ownerId,
        applicants.map((a) => a.applicationId),
        'accepted',
      ),
    );
    await makeDue(event.id);

    const sender = fakeSender({ delayMs: 5 });
    const deps = { sendEmail: sender.send, appUrl };
    const userIds = applicants.map((a) => a.userId);
    const [a, b] = await Promise.all([
      processOutbox(sql, deps, { userIds, limit: 20 }),
      processOutbox(sql, deps, { userIds, limit: 20 }),
    ]);

    const recipients = sender.sent.map((s) => s.to);
    expect(new Set(recipients).size).toBe(recipients.length);
    expect(a.claimed + b.claimed).toBe(30);
    expect(recipients).toHaveLength(30);
  });

  it('never sends to a suppressed address', async () => {
    const { event, applicants } = await eventWithApplicants(1);
    const { applicationId, userId, email } = first(applicants);
    await addSuppressions(sql, [email.toUpperCase()], 'bounce');
    await tx((t) => decideApplications(t, event.id, ownerId, [applicationId], 'accepted'));
    await makeDue(event.id);

    const sender = fakeSender();
    const result = await processOutbox(
      sql,
      { sendEmail: sender.send, appUrl },
      { userIds: [userId] },
    );
    expect(result.suppressed).toBe(1);
    expect(sender.sent).toEqual([]);
    await sql`delete from email_suppressions where email = ${email.toLowerCase()}`;
  });

  it('retries a failed send after 1 minute, and gives up after 5 attempts', async () => {
    const { event, applicants } = await eventWithApplicants(1);
    const { applicationId, userId, email } = first(applicants);
    await tx((t) => decideApplications(t, event.id, ownerId, [applicationId], 'accepted'));
    await makeDue(event.id);

    const failing = fakeSender({ fail: true });
    const attempt = await processOutbox(
      sql,
      { sendEmail: failing.send, appUrl },
      { userIds: [userId] },
    );
    expect(attempt.retrying).toBe(1);
    const [row] = await sql<
      [{ status: string; attempts: number; wait: number; last_error: string }]
    >`
      select status::text, attempts, extract(epoch from send_after - now())::float as wait, last_error
      from notification_outbox where user_id = ${userId}
    `;
    expect(row).toMatchObject({ status: 'pending', attempts: 1 });
    expect(row.wait).toBeGreaterThan(50);
    expect(row.last_error).not.toContain(email);

    await sql`update notification_outbox set attempts = 4, send_after = now() where user_id = ${userId}`;
    const last = await processOutbox(
      sql,
      { sendEmail: failing.send, appUrl },
      { userIds: [userId] },
    );
    expect(last.failed).toBe(1);
  });

  it('returns rows stuck in sending to pending', async () => {
    const { event, applicants } = await eventWithApplicants(1);
    const { applicationId, userId } = first(applicants);
    await tx((t) => decideApplications(t, event.id, ownerId, [applicationId], 'accepted'));
    await makeDue(event.id);
    const [claimed] = await claimOutbox(sql, 10, [userId]);
    expect(claimed).toBeDefined();

    await sql`update notification_outbox set locked_until = now() - interval '1 second' where user_id = ${userId}`;
    // Another test file's tick may recover it first; either way it ends up pending.
    await recoverStuckOutbox(sql);
    const [row] = await sql`select status::text from notification_outbox where user_id = ${userId}`;
    expect(row?.status).toBe('pending');
  });
});

describe('tick', () => {
  it('does nothing while another tick holds the lock', async () => {
    const sender = fakeSender();
    await sql.begin(async (t) => {
      await t`select pg_advisory_xact_lock(${TICK_LOCK_KEY}::bigint)`;
      expect(await runTick(sql, { sendEmail: sender.send, appUrl })).toEqual({ skipped: true });
    });
    expect(sender.sent).toEqual([]);
  });
});

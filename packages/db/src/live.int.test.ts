// Live features (build plan Phase 6): channel authorization, broadcasts after commit only,
// mentor claims under concurrency, and push receipts.
import { randomUUID } from 'node:crypto';
import { ApiError, liveTopics } from '@hx/shared';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { closeSql, getSql, tx, type ISql } from './client';
import {
  claimMentorRequest,
  createAnnouncement,
  createMentorRequest,
  listAnnouncements,
  liveStats,
  resolveMentorRequest,
} from './live';
import { checkPushReceipts, processPushOutbox, type PushDeps, type PushTicket } from './push';
import { createTeam } from './teams';
import { confirmApplicant, testData } from './testing';

const sql = getSql();
const data = testData(sql);
const parallel = postgres(process.env.DATABASE_URL ?? '', {
  max: 6,
  prepare: false,
  onnotice: () => {},
});
afterAll(async () => {
  await sql`delete from realtime.messages where topic like 'event:%' or topic like 'team:%' or topic like 'user:%'`.catch(
    () => undefined,
  );
  await data.cleanup();
  await parallel.end({ timeout: 5 });
  await closeSql();
});

async function outcome(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'ok';
  } catch (error) {
    if (error instanceof ApiError) return error.code;
    throw error;
  }
}

/** A live event with an owner, a mentor, a confirmed participant on a team, and an outsider. */
async function liveEvent() {
  const owner = await data.user('Owner');
  const event = await data.event(owner.id, { status: 'live' });
  const mentor = await data.user('Mentor');
  const mentor2 = await data.user('Mentor 2');
  await data.staff(event.id, mentor.id, 'mentor');
  await data.staff(event.id, mentor2.id, 'mentor');
  const hacker = await data.user('Hacker');
  await confirmApplicant(sql, event.id, hacker.id);
  const team = await tx((t) => createTeam(t, event.id, hacker.id, randomUUID(), 'ClinicQ'));
  const other = await data.user('Other hacker');
  await confirmApplicant(sql, event.id, other.id);
  const otherTeam = await tx((t) => createTeam(t, event.id, other.id, randomUUID(), 'Other'));
  return { eventId: event.id, owner, mentor, mentor2, hacker, team, other, otherTeam };
}

/** Whether `userId` may receive `topic`, asked of the real RLS policy as that user would. */
async function canReceive(topic: string, userId: string): Promise<boolean> {
  return sql
    .begin(async (t) => {
      await t`insert into realtime.messages (topic, extension, payload, event, private)
            values (${topic}, 'broadcast', '{}', 'hint', true)`;
      await t`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`;
      await t`select set_config('realtime.topic', ${topic}, true)`;
      await t`set local role authenticated`;
      const rows = await t`select 1 from realtime.messages where topic = ${topic}`;
      await t`reset role`;
      throw Object.assign(new Error('rollback'), { visible: rows.length > 0 });
    })
    .catch((error: { visible?: boolean }) => {
      if (error.visible === undefined) throw error;
      return error.visible;
    });
}

const messages = (s: ISql, topic: string) =>
  s<{ payload: { type: string } }[]>`select payload from realtime.messages where topic = ${topic}`;

describe('channel authorization (RLS on realtime.messages)', () => {
  it('admits each channel only to its subscribers', async () => {
    const f = await liveEvent();
    const staff = liveTopics.staff(f.eventId);
    expect(await canReceive(staff, f.owner.id)).toBe(true);
    expect(await canReceive(staff, f.hacker.id)).toBe(false);
    expect(await canReceive(staff, f.mentor.id)).toBe(false);

    expect(await canReceive(liveTopics.mentors(f.eventId), f.mentor.id)).toBe(true);
    expect(await canReceive(liveTopics.mentors(f.eventId), f.hacker.id)).toBe(false);

    expect(await canReceive(liveTopics.team(f.team.id), f.hacker.id)).toBe(true);
    expect(await canReceive(liveTopics.team(f.otherTeam.id), f.hacker.id)).toBe(false);

    expect(await canReceive(liveTopics.announcements(f.eventId), f.hacker.id)).toBe(true);
    const stranger = await data.user('Stranger');
    expect(await canReceive(liveTopics.announcements(f.eventId), stranger.id)).toBe(false);

    expect(await canReceive(liveTopics.user(f.hacker.id), f.hacker.id)).toBe(true);
    expect(await canReceive(liveTopics.user(f.hacker.id), f.other.id)).toBe(false);
    expect(await canReceive('event:not-a-uuid:staff', f.owner.id)).toBe(false);
  }, 60_000);
});

describe('broadcasts', () => {
  it('sends a hint when the write commits, and nothing when it rolls back', async () => {
    const f = await liveEvent();
    const topic = liveTopics.announcements(f.eventId);
    await sql
      .begin(async (t) => {
        await createAnnouncement(t, f.eventId, f.owner.id, randomUUID(), {
          title: 'Lost',
          body: 'Rolled back',
        });
        throw new Error('roll back');
      })
      .catch(() => undefined);
    expect(await messages(sql, topic)).toHaveLength(0);

    await tx((t) =>
      createAnnouncement(t, f.eventId, f.owner.id, randomUUID(), { title: 'Lunch', body: 'Now' }),
    );
    const sent = await messages(sql, topic);
    expect(sent.map((m) => m.payload.type)).toEqual(['announcement.created']);
    expect((await listAnnouncements(sql, f.eventId)).items.map((a) => a.title)).toEqual(['Lunch']);
  }, 60_000);

  it('sends staff counts as numbers', async () => {
    const f = await liveEvent();
    await tx((t) =>
      createMentorRequest(t, f.eventId, f.hacker.id, randomUUID(), {
        topic: 'Auth bug',
        description: '',
      }),
    );
    const [stats] = await sql<[{ payload: { type: string; mentor_open: number } }]>`
      select payload from realtime.messages where topic = ${liveTopics.staff(f.eventId)} order by id desc limit 1
    `;
    expect(stats.payload).toMatchObject({ type: 'stats', mentor_open: 1 });
    expect((await liveStats(sql, f.eventId)).mentor_open).toBe(1);
  }, 60_000);
});

describe('mentor queue', () => {
  it('two mentors claiming at the same moment: exactly one succeeds, in 10 rounds', async () => {
    const f = await liveEvent();
    for (let round = 0; round < 10; round++) {
      const id = randomUUID();
      await tx((t) =>
        createMentorRequest(t, f.eventId, f.hacker.id, id, {
          topic: `Help ${round}`,
          description: '',
        }),
      );
      const results = await Promise.all(
        [f.mentor, f.mentor2].map((m) =>
          outcome(() => parallel.begin((t) => claimMentorRequest(t, id, m.id))),
        ),
      );
      expect(results.sort()).toEqual(['ALREADY_CLAIMED', 'ok']);
      const [row] = await sql<
        [{ claimed_at: Date | null }]
      >`select claimed_at from mentor_requests where id = ${id}`;
      expect(row.claimed_at).not.toBeNull();
      const [winner] = await sql<
        [{ claimed_by: string }]
      >`select claimed_by from mentor_requests where id = ${id}`;
      await tx((t) => resolveMentorRequest(t, id, winner.claimed_by));
    }
  }, 120_000);

  it('only takes requests while live, from team members, a few at a time; retries are harmless', async () => {
    const f = await liveEvent();
    const id = randomUUID();
    const first = await tx((t) =>
      createMentorRequest(t, f.eventId, f.hacker.id, id, { topic: 'A', description: '' }),
    );
    const again = await tx((t) =>
      createMentorRequest(t, f.eventId, f.hacker.id, id, { topic: 'A', description: '' }),
    );
    expect(again.id).toBe(first.id);
    await tx((t) =>
      createMentorRequest(t, f.eventId, f.hacker.id, randomUUID(), { topic: 'B', description: '' }),
    );
    await tx((t) =>
      createMentorRequest(t, f.eventId, f.hacker.id, randomUUID(), { topic: 'C', description: '' }),
    );
    expect(
      await outcome(() =>
        tx((t) =>
          createMentorRequest(t, f.eventId, f.hacker.id, randomUUID(), {
            topic: 'D',
            description: '',
          }),
        ),
      ),
    ).toBe('CONFLICT');
    const loner = await data.user('Loner');
    await confirmApplicant(sql, f.eventId, loner.id);
    expect(
      await outcome(() =>
        tx((t) =>
          createMentorRequest(t, f.eventId, loner.id, randomUUID(), {
            topic: 'E',
            description: '',
          }),
        ),
      ),
    ).toBe('NOT_ON_TEAM');
    await sql`update events set status = 'judging' where id = ${f.eventId}`;
    expect(
      await outcome(() =>
        tx((t) =>
          createMentorRequest(t, f.eventId, f.other.id, randomUUID(), {
            topic: 'F',
            description: '',
          }),
        ),
      ),
    ).toBe('MENTORING_CLOSED');
  }, 60_000);
});

describe('push', () => {
  it('sends announcements through Expo and deletes a token whose receipt says DeviceNotRegistered', async () => {
    const f = await liveEvent();
    const good = `ExponentPushToken[good-${randomUUID()}]`;
    const dead = `ExponentPushToken[dead-${randomUUID()}]`;
    await sql`insert into push_tokens (token, user_id, platform) values (${good}, ${f.hacker.id}, 'android'), (${dead}, ${f.hacker.id}, 'android')`;
    await tx((t) =>
      createAnnouncement(t, f.eventId, f.owner.id, randomUUID(), {
        title: 'Demo time',
        body: 'Room 2',
      }),
    );

    const sent: string[] = [];
    const deps: PushDeps = {
      appUrl: 'https://hack.example.test',
      send: (batch) => {
        sent.push(...batch.map((m) => m.to));
        return Promise.resolve(
          batch.map((m): PushTicket => ({ status: 'ok', id: `ticket-${m.to}` })),
        );
      },
      getReceipts: (ids) =>
        Promise.resolve(
          Object.fromEntries(
            ids.map((id) => [
              id,
              id.includes('dead')
                ? { status: 'error' as const, details: { error: 'DeviceNotRegistered' } }
                : { status: 'ok' as const },
            ]),
          ),
        ),
    };
    const result = await processPushOutbox(sql, deps, { userIds: [f.hacker.id] });
    expect(result).toMatchObject({ sent: 1 });
    expect(sent.sort()).toEqual([dead, good].sort());

    const receipts = await checkPushReceipts(sql, deps, { minutes: 0, userIds: [f.hacker.id] });
    expect(receipts).toEqual({ checked: 1, removed: 1 });
    const tokens = await sql<
      { token: string }[]
    >`select token from push_tokens where user_id = ${f.hacker.id}`;
    expect(tokens.map((t) => t.token)).toEqual([good]);
    await sql`delete from push_tokens where user_id = ${f.hacker.id}`;
  }, 60_000);
});

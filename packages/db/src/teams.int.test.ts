// Team joins under concurrency (build plan Phase 3, Agent rule 20): real parallel transactions
// against Postgres, each on its own connection. They must pass every run.
import { ApiError } from '@hx/shared';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeSql, getSql, tx } from './client';
import { hitRateLimit } from './guards';
import {
  createTeam,
  getMyTeam,
  joinTeam,
  leaveTeam,
  removeTeamMember,
  withTeamErrors,
} from './teams';
import { confirmApplicant, testData } from './testing';

const sql = getSql();
const data = testData(sql);
// A separate client with enough connections for every request to run at the same time.
const parallel = postgres(process.env.DATABASE_URL ?? '', {
  max: 22,
  prepare: false,
  onnotice: () => {},
});

afterAll(async () => {
  await data.cleanup();
  await parallel.end({ timeout: 5 });
  await closeSql();
});

/** Runs one join in its own transaction on its own connection; returns the error code or 'ok'. */
async function attemptJoin(eventId: string, userId: string, code: string): Promise<string> {
  try {
    await withTeamErrors(() => parallel.begin((t) => joinTeam(t, eventId, userId, code)));
    return 'ok';
  } catch (error) {
    if (error instanceof ApiError) return error.code;
    throw error;
  }
}

async function confirmedUsers(eventId: string, count: number) {
  const users = [];
  for (let i = 0; i < count; i++) {
    const user = await data.user(`Hacker ${i}`);
    await confirmApplicant(sql, eventId, user.id);
    users.push(user);
  }
  return users;
}

describe('20 simultaneous joins for 1 open slot', () => {
  let owner: { id: string };
  let joiners: { id: string }[];

  beforeAll(async () => {
    owner = await data.user('Team owner');
    joiners = [];
    for (let i = 0; i < 22; i++) joiners.push(await data.user(`Joiner ${i}`));
  }, 120_000);

  it('exactly 1 succeeds and 19 get TEAM_FULL, in each of 20 rounds', async () => {
    for (let round = 0; round < 20; round++) {
      // Fresh event per round (each person may be on one team per event); team size max 4.
      const event = await data.event(owner.id);
      for (const user of [owner, ...joiners]) await confirmApplicant(sql, event.id, user.id);
      const team = await tx((t) =>
        createTeam(t, event.id, owner.id, crypto.randomUUID(), `Round ${round}`),
      );
      // Two more members leave exactly one open slot.
      for (const early of joiners.slice(0, 2))
        await tx((t) => joinTeam(t, event.id, early.id, team.invite_code));

      const racers = joiners.slice(2);
      expect(racers).toHaveLength(20);
      const results = await Promise.all(
        racers.map((u) => attemptJoin(event.id, u.id, team.invite_code)),
      );

      expect(results.filter((r) => r === 'ok')).toHaveLength(1);
      expect(results.filter((r) => r === 'TEAM_FULL')).toHaveLength(19);
      const [{ members }] = await sql<[{ members: number }]>`
          select count(*)::int as members from team_members where team_id = ${team.id}
        `;
      expect(members).toBe(4);
    }
  }, 300_000);
});

describe('one person joining two teams at the same moment', () => {
  it('exactly one join succeeds, in each of 10 rounds', async () => {
    const ownerA = await data.user('Owner A');
    const ownerB = await data.user('Owner B');
    const racer = await data.user('Racer');
    for (let round = 0; round < 10; round++) {
      const event = await data.event(ownerA.id);
      for (const u of [ownerA, ownerB, racer]) await confirmApplicant(sql, event.id, u.id);
      const a = await tx((t) => createTeam(t, event.id, ownerA.id, crypto.randomUUID(), 'A'));
      const b = await tx((t) => createTeam(t, event.id, ownerB.id, crypto.randomUUID(), 'B'));

      const results = await Promise.all([
        attemptJoin(event.id, racer.id, a.invite_code),
        attemptJoin(event.id, racer.id, b.invite_code),
      ]);
      expect(results.sort()).toEqual(['ALREADY_ON_TEAM', 'ok']);
      const rows =
        await sql`select 1 from team_members where event_id = ${event.id} and user_id = ${racer.id}`;
      expect(rows).toHaveLength(1);
    }
  }, 120_000);
});

describe('joins and the deadline lock together', () => {
  it('never deadlock: each join lands before the lock or gets SUBMISSION_LOCKED', async () => {
    const owner = await data.user('Lock owner');
    for (let round = 0; round < 5; round++) {
      const event = await data.event(owner.id);
      await confirmApplicant(sql, event.id, owner.id);
      await sql`update events set team_size_max = 20 where id = ${event.id}`;
      const team = await tx((t) =>
        createTeam(t, event.id, owner.id, crypto.randomUUID(), 'Locked'),
      );
      const joiners = await confirmedUsers(event.id, 10);

      // Stand-in for the Phase 4 lock step: event FOR UPDATE, then team rows, then lock.
      const lock = parallel.begin(async (t) => {
        await t`select id from events where id = ${event.id} for update`;
        await t`update teams set looking_for_members = false where event_id = ${event.id}`;
        await t`update events set submissions_locked_at = now() where id = ${event.id}`;
      });
      const joins = joiners.map((u) => attemptJoin(event.id, u.id, team.invite_code));
      const [, ...results] = await Promise.all([lock, ...joins]);

      for (const result of results) expect(['ok', 'SUBMISSION_LOCKED']).toContain(result);
      const [{ members }] = await sql<[{ members: number }]>`
          select count(*)::int as members from team_members where team_id = ${team.id}
        `;
      expect(members).toBe(1 + results.filter((r) => r === 'ok').length);
    }
  }, 120_000);
});

describe('rate limit', () => {
  it('allows 10 attempts a minute and refuses the 11th', async () => {
    const key = `join:test:${crypto.randomUUID()}`;
    for (let i = 0; i < 10; i++) await hitRateLimit(sql, key, 10, 60);
    await expect(hitRateLimit(sql, key, 10, 60)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await sql`delete from rate_limit_counters where key = ${key}`;
  });
});

describe('leaving and removing', () => {
  it('passes ownership to the earliest joiner, and soft-deletes the team when the last one leaves', async () => {
    const [first, second, third] = [
      await data.user('First'),
      await data.user('Second'),
      await data.user('Third'),
    ];
    const event = await data.event(first.id);
    for (const u of [first, second, third]) await confirmApplicant(sql, event.id, u.id);
    const team = await tx((t) =>
      createTeam(t, event.id, first.id, crypto.randomUUID(), 'Hand-off'),
    );
    await tx((t) => joinTeam(t, event.id, second.id, team.invite_code));
    await tx((t) => joinTeam(t, event.id, third.id, team.invite_code));

    await tx((t) => leaveTeam(t, event.id, first.id));
    expect((await getMyTeam(sql, event.id, second.id))?.owner_id).toBe(second.id);

    await tx((t) => leaveTeam(t, event.id, second.id));
    await tx((t) => leaveTeam(t, event.id, third.id));
    const [row] = await sql`select deleted_at from teams where id = ${team.id}`;
    expect(row?.deleted_at).not.toBeNull();
    const audits =
      await sql`select 1 from audit_log where entity_id = ${team.id} and action = 'team.deleted'`;
    expect(audits).toHaveLength(1);
  });

  it('lets only the owner remove a member, and audits it', async () => {
    const [owner, member] = [await data.user('Owner'), await data.user('Member')];
    const event = await data.event(owner.id);
    for (const u of [owner, member]) await confirmApplicant(sql, event.id, u.id);
    const team = await tx((t) => createTeam(t, event.id, owner.id, crypto.randomUUID(), 'Remove'));
    await tx((t) => joinTeam(t, event.id, member.id, team.invite_code));

    await expect(
      tx((t) => removeTeamMember(t, event.id, member.id, owner.id)),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const after = await tx((t) => removeTeamMember(t, event.id, owner.id, member.id));
    expect(after.members.map((m) => m.user_id)).toEqual([owner.id]);
    const audits =
      await sql`select 1 from audit_log where entity_id = ${team.id} and action = 'team.member_removed'`;
    expect(audits).toHaveLength(1);
  });

  it('refuses joins and leaves after the deadline with SUBMISSION_LOCKED', async () => {
    const [owner, late] = [await data.user('Owner'), await data.user('Late')];
    const event = await data.event(owner.id);
    for (const u of [owner, late]) await confirmApplicant(sql, event.id, u.id);
    const team = await tx((t) =>
      createTeam(t, event.id, owner.id, crypto.randomUUID(), 'Deadline'),
    );
    await sql`
      update events
      set starts_at = now() - interval '2 days', submission_deadline = now() - interval '1 hour',
          ends_at = now() + interval '1 hour'
      where id = ${event.id}
    `;
    await expect(tx((t) => joinTeam(t, event.id, late.id, team.invite_code))).rejects.toMatchObject(
      {
        code: 'SUBMISSION_LOCKED',
      },
    );
    await expect(tx((t) => leaveTeam(t, event.id, owner.id))).rejects.toMatchObject({
      code: 'SUBMISSION_LOCKED',
    });
  });

  it('refuses people who have not confirmed their place', async () => {
    const [owner, applicant] = [await data.user('Owner'), await data.user('Applicant')];
    const event = await data.event(owner.id);
    await confirmApplicant(sql, event.id, owner.id);
    await sql`insert into applications (event_id, user_id, status) values (${event.id}, ${applicant.id}, 'accepted')`;
    const team = await tx((t) =>
      createTeam(t, event.id, owner.id, crypto.randomUUID(), 'Confirmed only'),
    );
    await expect(
      tx((t) => joinTeam(t, event.id, applicant.id, team.invite_code)),
    ).rejects.toMatchObject({
      code: 'NOT_CONFIRMED',
    });
  });

  it('makes a repeated create with the same id return the same team', async () => {
    const owner = await data.user('Retry');
    const event = await data.event(owner.id);
    await confirmApplicant(sql, event.id, owner.id);
    const id = crypto.randomUUID();
    const first = await tx((t) => createTeam(t, event.id, owner.id, id, 'Retry'));
    const again = await tx((t) => createTeam(t, event.id, owner.id, id, 'Retry'));
    expect(again.id).toBe(first.id);
    expect(again.invite_code).toBe(first.invite_code);
  });
});

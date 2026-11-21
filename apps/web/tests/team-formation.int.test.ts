// R36: skill ratings and organizer team forming (auto-group, draft, publish).
import { getSql } from '@hx/db';
import { confirmApplicant } from '@hx/db/testing';
import {
  myApplicationSchema,
  publishDraftResultSchema,
  teamFormationSchema,
  type SkillRatings,
} from '@hx/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PUT as setSkills } from '@/app/api/v1/events/[id]/applications/me/skills/route';
import { POST as autoGroup } from '@/app/api/v1/events/[id]/team-formation/auto/route';
import {
  DELETE as discardDraft,
  PUT as saveDraft,
} from '@/app/api/v1/events/[id]/team-formation/draft/route';
import { POST as publish } from '@/app/api/v1/events/[id]/team-formation/publish/route';
import { GET as formation } from '@/app/api/v1/events/[id]/team-formation/route';
import { POST as createTeam } from '@/app/api/v1/events/[id]/teams/route';
import { call, expectError, fixtures } from './helpers';

const fx = fixtures();
const sql = getSql();
afterAll(() => fx.cleanup());

const rate = (n: number): SkillRatings => ({
  coding: n,
  design: n,
  business: n,
  presentation: n,
});

describe('team forming', () => {
  let eventId: string;
  let people: Awaited<ReturnType<typeof fx.eventWithRoles>>['people'];
  const players: string[] = [];

  beforeAll(async () => {
    const result = await fx.eventWithRoles();
    eventId = result.event.id;
    people = result.people;
    await sql`update events set team_size_min = 2, team_size_max = 4 where id = ${eventId}`;
    // Two experts, two beginners, two in the middle, and one person who forms their own team.
    for (const [i, level] of [5, 5, 1, 1, 3, 3].entries()) {
      const user = await fx.user(`Player ${i}`);
      await confirmApplicant(sql, eventId, user.id);
      await sql`
        update applications set skill_ratings = ${sql.json(rate(level))}
        where event_id = ${eventId} and user_id = ${user.id}
      `;
      players.push(user.id);
    }
    const selfFormer = await fx.user('Self Former');
    await confirmApplicant(sql, eventId, selfFormer.id);
    await call(createTeam, {
      method: 'POST',
      as: selfFormer.id,
      params: { id: eventId },
      body: { id: crypto.randomUUID(), name: 'Own team' },
    });
  });

  const params = () => ({ id: eventId });
  const current = async () =>
    teamFormationSchema.parse(
      await (await call(formation, { as: people.owner.id, params: params() })).json(),
    );

  it('lists confirmed people with no team, with ratings; self-formed teams are left out', async () => {
    const response = await call(formation, { as: people.admin.id, params: params() });
    const data = teamFormationSchema.parse(await response.json());
    expect(data.pool.map((p) => p.user_id).sort()).toEqual([...players].sort());
    expect(data.draft).toBeNull();
    expect(data.pool.every((p) => p.skill_ratings !== null)).toBe(true);
  });

  it.each(['judge', 'mentor', 'volunteer', 'participant'] as const)(
    'refuses a %s on every team-forming endpoint',
    async (role) => {
      const as = people[role].id;
      await expectError(await call(formation, { as, params: params() }), 403, 'FORBIDDEN');
      await expectError(
        await call(autoGroup, {
          method: 'POST',
          as,
          params: params(),
          body: { team_size: 3, version: 0 },
        }),
        403,
        'FORBIDDEN',
      );
      await expectError(
        await call(saveDraft, {
          method: 'PUT',
          as,
          params: params(),
          body: { version: 0, teams: [] },
        }),
        403,
        'FORBIDDEN',
      );
      await expectError(
        await call(discardDraft, { method: 'DELETE', as, params: params() }),
        403,
        'FORBIDDEN',
      );
      await expectError(
        await call(publish, { method: 'POST', as, params: params(), body: { version: 1 } }),
        403,
        'FORBIDDEN',
      );
    },
  );

  it('auto-groups into balanced teams: the two experts end up apart', async () => {
    const response = await call(autoGroup, {
      method: 'POST',
      as: people.owner.id,
      params: params(),
      body: { team_size: 3, version: 0 },
    });
    const data = teamFormationSchema.parse(await response.json());
    expect(data.draft?.teams).toHaveLength(2);
    const experts = new Set(players.slice(0, 2));
    for (const team of data.draft?.teams ?? []) {
      expect(team.member_ids).toHaveLength(3);
      expect(team.member_ids.filter((id) => experts.has(id))).toHaveLength(1);
    }
  });

  it('refuses a team size the event does not allow, and a stale draft version', async () => {
    const { draft } = await current();
    await expectError(
      await call(autoGroup, {
        method: 'POST',
        as: people.owner.id,
        params: params(),
        body: { team_size: 9, version: draft?.version ?? 0 },
      }),
      400,
      'VALIDATION_FAILED',
    );
    await expectError(
      await call(saveDraft, {
        method: 'PUT',
        as: people.owner.id,
        params: params(),
        body: { version: 0, teams: [] },
      }),
      409,
      'STALE_VERSION',
    );
  });

  it('saves hand edits, and refuses someone who is not a confirmed participant', async () => {
    const version = (await current()).draft?.version ?? 0;
    await expectError(
      await call(saveDraft, {
        method: 'PUT',
        as: people.owner.id,
        params: params(),
        body: { version, teams: [{ name: 'X', member_ids: [people.judge.id] }] },
      }),
      400,
      'VALIDATION_FAILED',
    );
    const saved = teamFormationSchema.parse(
      await (
        await call(saveDraft, {
          method: 'PUT',
          as: people.owner.id,
          params: params(),
          body: {
            version,
            teams: [
              { name: 'Rockets', member_ids: players.slice(0, 3) },
              { name: 'Comets', member_ids: players.slice(3) },
            ],
          },
        })
      ).json(),
    );
    expect(saved.draft?.version).toBe(version + 1);
    expect(saved.draft?.teams.map((t) => t.name)).toEqual(['Rockets', 'Comets']);
  });

  it('publishes: creates the teams, audits them, queues emails and clears the draft', async () => {
    const version = (await current()).draft?.version ?? 0;
    const result = publishDraftResultSchema.parse(
      await (
        await call(publish, {
          method: 'POST',
          as: people.admin.id,
          params: params(),
          body: { version },
        })
      ).json(),
    );
    expect(result).toEqual({ teams: 2, placed: 6, skipped: [] });

    const teams = await sql<{ name: string; members: number }[]>`
      select t.name, count(m.user_id)::int as members from teams t
      join team_members m on m.team_id = t.id
      where t.event_id = ${eventId} and t.name in ('Rockets', 'Comets')
      group by t.name order by t.name
    `;
    expect(teams).toEqual([
      { name: 'Comets', members: 3 },
      { name: 'Rockets', members: 3 },
    ]);
    const audits = await sql`
      select 1 from audit_log where event_id = ${eventId} and action = 'team.formed'
    `;
    expect(audits).toHaveLength(2);
    const emails = await sql`
      select 1 from notification_outbox
      where template = 'team_assigned' and payload->>'event_id' = ${eventId}
    `;
    expect(emails).toHaveLength(6);

    const after = await current();
    expect(after.draft).toBeNull();
    expect(after.pool).toHaveLength(0);
  });

  it('refuses to form teams after the submission deadline', async () => {
    await sql`
      update events set starts_at = now() - interval '2 hours',
             submission_deadline = now() - interval '1 minute'
      where id = ${eventId}
    `;
    await expectError(
      await call(autoGroup, {
        method: 'POST',
        as: people.owner.id,
        params: params(),
        body: { team_size: 3, version: 0 },
      }),
      423,
      'SUBMISSION_LOCKED',
    );
  });
});

describe('skill ratings', () => {
  it('lets an applicant add or change their own ratings, and checks them', async () => {
    const { event, people } = await fx.eventWithRoles();
    await confirmApplicant(sql, event.id, people.participant.id);
    const ratings = { coding: 4, design: 2, business: 3, presentation: 5 };
    const response = await call(setSkills, {
      method: 'PUT',
      as: people.participant.id,
      params: { id: event.id },
      body: { skill_ratings: ratings },
    });
    expect(myApplicationSchema.parse(await response.json()).skill_ratings).toEqual(ratings);
    await expectError(
      await call(setSkills, {
        method: 'PUT',
        as: people.participant.id,
        params: { id: event.id },
        body: { skill_ratings: { ...ratings, coding: 9 } },
      }),
      400,
      'VALIDATION_FAILED',
    );
    // Staff who never applied have no application to rate.
    await expectError(
      await call(setSkills, {
        method: 'PUT',
        as: people.judge.id,
        params: { id: event.id },
        body: { skill_ratings: ratings },
      }),
      404,
      'NOT_FOUND',
    );
  });
});

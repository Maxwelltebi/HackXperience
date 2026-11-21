// Phase 6: live endpoints through the API, with every role that must be refused.
import { createTeam, getSql, tx } from '@hx/db';
import { confirmApplicant } from '@hx/db/testing';
import {
  announcementListSchema,
  liveStatsSchema,
  mentorRequestListSchema,
  mentorRequestSchema,
} from '@hx/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  GET as listAnnouncements,
  POST as postAnnouncement,
} from '@/app/api/v1/events/[id]/announcements/route';
import { GET as liveStats } from '@/app/api/v1/events/[id]/live-stats/route';
import {
  GET as mentorQueue,
  POST as askMentor,
} from '@/app/api/v1/events/[id]/mentor-requests/route';
import { GET as teamRequests } from '@/app/api/v1/events/[id]/teams/me/mentor-requests/route';
import { POST as cancel } from '@/app/api/v1/mentor-requests/[rid]/cancel/route';
import { POST as claim } from '@/app/api/v1/mentor-requests/[rid]/claim/route';
import { POST as resolve } from '@/app/api/v1/mentor-requests/[rid]/resolve/route';
import { call, expectError, fixtures } from './helpers';

const fx = fixtures();
const sql = getSql();
afterAll(() => fx.cleanup());

let eventId: string;
let people: Awaited<ReturnType<typeof fx.eventWithRoles>>['people'];
let stranger: { id: string };

beforeAll(async () => {
  const result = await fx.eventWithRoles({ status: 'live' });
  eventId = result.event.id;
  people = result.people;
  await confirmApplicant(sql, eventId, people.participant.id);
  await tx((t) => createTeam(t, eventId, people.participant.id, crypto.randomUUID(), 'ClinicQ'));
  stranger = await fx.user('Stranger');
}, 60_000);

describe('announcements', () => {
  it.each(['judge', 'mentor', 'volunteer', 'participant'] as const)(
    'refuses a %s who tries to post',
    async (role) => {
      await expectError(
        await call(postAnnouncement, {
          method: 'POST',
          as: people[role].id,
          params: { id: eventId },
          body: { title: 'Hi', body: 'There' },
        }),
        403,
        'FORBIDDEN',
      );
    },
  );

  it('lets an admin post; staff and confirmed participants read; others are refused', async () => {
    const response = await call(postAnnouncement, {
      method: 'POST',
      as: people.admin.id,
      params: { id: eventId },
      body: { title: 'Lunch', body: 'Served in the hall' },
    });
    expect(response.status).toBe(201);
    for (const who of [people.participant, people.volunteer]) {
      const list = announcementListSchema.parse(
        await (await call(listAnnouncements, { as: who.id, params: { id: eventId } })).json(),
      );
      expect(list.items.map((a) => a.title)).toEqual(['Lunch']);
    }
    await expectError(
      await call(listAnnouncements, { as: stranger.id, params: { id: eventId } }),
      403,
      'NOT_CONFIRMED',
    );
  });
});

describe('mentor queue', () => {
  let requestId: string;

  it('lets a team member ask, and refuses someone without a team', async () => {
    const response = await call(askMentor, {
      method: 'POST',
      as: people.participant.id,
      params: { id: eventId },
      body: { topic: 'Supabase auth', description: 'Redirect loop' },
    });
    expect(response.status).toBe(201);
    requestId = mentorRequestSchema.parse(await response.json()).id;
    await expectError(
      await call(askMentor, {
        method: 'POST',
        as: stranger.id,
        params: { id: eventId },
        body: { topic: 'X' },
      }),
      404,
      'NOT_ON_TEAM',
    );
    const mine = mentorRequestListSchema.parse(
      await (
        await call(teamRequests, { as: people.participant.id, params: { id: eventId } })
      ).json(),
    );
    expect(mine.items).toHaveLength(1);
  });

  it('shows the queue to mentors and organizers only', async () => {
    const list = mentorRequestListSchema.parse(
      await (await call(mentorQueue, { as: people.mentor.id, params: { id: eventId } })).json(),
    );
    expect(list.items[0]?.topic).toBe('Supabase auth');
    for (const role of ['judge', 'volunteer', 'participant'] as const) {
      await expectError(
        await call(mentorQueue, { as: people[role].id, params: { id: eventId } }),
        403,
        'FORBIDDEN',
      );
    }
  });

  it('lets only mentors claim, only the claimer resolve, and only the team cancel', async () => {
    for (const role of ['admin', 'owner', 'participant'] as const) {
      await expectError(
        await call(claim, { method: 'POST', as: people[role].id, params: { rid: requestId } }),
        403,
        'FORBIDDEN',
      );
    }
    const claimed = await call(claim, {
      method: 'POST',
      as: people.mentor.id,
      params: { rid: requestId },
    });
    expect(mentorRequestSchema.parse(await claimed.json()).status).toBe('claimed');
    await expectError(
      await call(claim, { method: 'POST', as: people.mentor.id, params: { rid: requestId } }),
      409,
      'ALREADY_CLAIMED',
    );
    await expectError(
      await call(cancel, { method: 'POST', as: people.mentor.id, params: { rid: requestId } }),
      403,
      'FORBIDDEN',
    );
    const done = await call(resolve, {
      method: 'POST',
      as: people.mentor.id,
      params: { rid: requestId },
    });
    expect(mentorRequestSchema.parse(await done.json()).status).toBe('resolved');
  });
});

describe('live dashboard', () => {
  it('shows counts to owners and admins only', async () => {
    const stats = liveStatsSchema.parse(
      await (await call(liveStats, { as: people.owner.id, params: { id: eventId } })).json(),
    );
    expect(stats).toMatchObject({ confirmed: 1, teams: 1, mentor_open: 0 });
    for (const role of ['judge', 'mentor', 'volunteer', 'participant'] as const) {
      await expectError(
        await call(liveStats, { as: people[role].id, params: { id: eventId } }),
        403,
        'FORBIDDEN',
      );
    }
  });
});

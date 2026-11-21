// Phase 3: tickets, check-in and teams through the API.
import { getSql } from '@hx/db';
import { confirmApplicant } from '@hx/db/testing';
import {
  checkInResultSchema,
  checkInStatsSchema,
  myTeamSchema,
  openTeamSchema,
  ticketSchema,
} from '@hx/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as manualCheckIn } from '@/app/api/v1/events/[id]/check-ins/manual/route';
import { POST as scan } from '@/app/api/v1/events/[id]/check-ins/route';
import { GET as searchAttendees } from '@/app/api/v1/events/[id]/check-ins/search/route';
import { GET as stats } from '@/app/api/v1/events/[id]/check-ins/stats/route';
import { GET as ticket } from '@/app/api/v1/events/[id]/me/ticket/route';
import { POST as joinTeam } from '@/app/api/v1/events/[id]/teams/join/route';
import { POST as rotate } from '@/app/api/v1/events/[id]/teams/me/invite-code/rotate/route';
import { POST as leave } from '@/app/api/v1/events/[id]/teams/me/leave/route';
import { DELETE as removeMember } from '@/app/api/v1/events/[id]/teams/me/members/[userId]/route';
import { GET as myTeam, PATCH as patchTeam } from '@/app/api/v1/events/[id]/teams/me/route';
import { GET as board, POST as createTeam } from '@/app/api/v1/events/[id]/teams/route';
import { call, expectError, fixtures } from './helpers';

const fx = fixtures();
const sql = getSql();
afterAll(() => fx.cleanup());

describe('tickets and check-in', () => {
  let eventId: string;
  let people: Awaited<ReturnType<typeof fx.eventWithRoles>>['people'];
  let ticketCode: string;

  beforeAll(async () => {
    const result = await fx.eventWithRoles();
    eventId = result.event.id;
    people = result.people;
    ticketCode = await confirmApplicant(sql, eventId, people.participant.id);
  });

  it('gives a confirmed participant their ticket, and refuses others', async () => {
    const response = await call(ticket, { as: people.participant.id, params: { id: eventId } });
    expect(ticketSchema.parse(await response.json())).toMatchObject({
      ticket_code: ticketCode,
      checked_in_at: null,
    });
    await expectError(
      await call(ticket, { as: people.judge.id, params: { id: eventId } }),
      403,
      'NOT_CONFIRMED',
    );
  });

  it('refuses a participant who tries to check people in', async () => {
    await expectError(
      await call(scan, {
        method: 'POST',
        as: people.participant.id,
        params: { id: eventId },
        body: { ticket_code: ticketCode },
      }),
      403,
      'FORBIDDEN',
    );
  });

  it.each(['judge', 'mentor'] as const)('refuses a %s at the scanner', async (role) => {
    await expectError(
      await call(scan, {
        method: 'POST',
        as: people[role].id,
        params: { id: eventId },
        body: { ticket_code: ticketCode },
      }),
      403,
      'FORBIDDEN',
    );
  });

  it('checks in on the first scan and shows the first time on the second', async () => {
    const first = await call(scan, {
      method: 'POST',
      as: people.volunteer.id,
      params: { id: eventId },
      body: { ticket_code: ticketCode },
    });
    expect(first.status).toBe(201);
    const result = checkInResultSchema.parse(await first.json());
    expect(result).toMatchObject({ name: 'Participant', method: 'scan' });

    const second = await expectError(
      await call(scan, {
        method: 'POST',
        as: people.volunteer.id,
        params: { id: eventId },
        body: { ticket_code: ticketCode },
      }),
      409,
      'ALREADY_CHECKED_IN',
    );
    expect(second.error.details).toMatchObject({ checked_in_at: result.checked_in_at });

    const counts = checkInStatsSchema.parse(
      await (await call(stats, { as: people.volunteer.id, params: { id: eventId } })).json(),
    );
    expect(counts).toEqual({ confirmed: 1, checked_in: 1 });
  });

  it('rejects tickets for another event and tickets of people who declined', async () => {
    await expectError(
      await call(scan, {
        method: 'POST',
        as: people.volunteer.id,
        params: { id: eventId },
        body: { ticket_code: 'tkt-not-a-real-ticket' },
      }),
      404,
      'TICKET_NOT_FOUND',
    );
    const decliner = await fx.user('Decliner');
    const declinedTicket = await confirmApplicant(sql, eventId, decliner.id);
    await sql`update applications set status = 'declined' where ticket_code = ${declinedTicket}`;
    await expectError(
      await call(scan, {
        method: 'POST',
        as: people.volunteer.id,
        params: { id: eventId },
        body: { ticket_code: declinedTicket },
      }),
      409,
      'TICKET_CANCELLED',
    );
  });

  it('lets an admin search and check someone in by hand, audited; a volunteer cannot', async () => {
    const forgot = await fx.user('Forgot Phone');
    await confirmApplicant(sql, eventId, forgot.id);

    await expectError(
      await call(manualCheckIn, {
        method: 'POST',
        as: people.volunteer.id,
        params: { id: eventId },
        body: { user_id: forgot.id },
      }),
      403,
      'FORBIDDEN',
    );
    await expectError(
      await call(searchAttendees, {
        as: people.volunteer.id,
        params: { id: eventId },
        path: '/x?q=forgot',
      }),
      403,
      'FORBIDDEN',
    );

    const found = (await (
      await call(searchAttendees, {
        as: people.admin.id,
        params: { id: eventId },
        path: '/x?q=forgot',
      })
    ).json()) as { items: { user_id: string; checked_in_at: string | null }[] };
    expect(found.items).toEqual([
      expect.objectContaining({ user_id: forgot.id, checked_in_at: null }),
    ]);

    const response = await call(manualCheckIn, {
      method: 'POST',
      as: people.admin.id,
      params: { id: eventId },
      body: { user_id: forgot.id },
    });
    expect(response.status).toBe(201);
    expect(checkInResultSchema.parse(await response.json()).method).toBe('manual');
    const audits = await sql`
      select 1 from audit_log where event_id = ${eventId} and action = 'check_in.manual' and entity_id = ${forgot.id}
    `;
    expect(audits).toHaveLength(1);
  });
});

describe('teams', () => {
  let eventId: string;
  let owner: { id: string };
  let mate: { id: string };

  beforeAll(async () => {
    const result = await fx.eventWithRoles();
    eventId = result.event.id;
    owner = await fx.user('Team Owner');
    mate = await fx.user('Team Mate');
    for (const u of [owner, mate]) await confirmApplicant(sql, eventId, u.id);
  });

  it('creates a team, joins it by code typed loosely, and hides the code on the board', async () => {
    const created = await call(createTeam, {
      method: 'POST',
      as: owner.id,
      params: { id: eventId },
      body: { name: 'ClinicQ' },
    });
    expect(created.status).toBe(201);
    const team = myTeamSchema.parse(await created.json());
    expect(team.invite_code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);

    const typed = `${team.invite_code.slice(0, 4).toLowerCase()} ${team.invite_code.slice(4)}`;
    const joined = await call(joinTeam, {
      method: 'POST',
      as: mate.id,
      params: { id: eventId },
      body: { invite_code: typed },
    });
    expect(myTeamSchema.parse(await joined.json()).members).toHaveLength(2);

    await call(patchTeam, {
      method: 'PATCH',
      as: mate.id,
      params: { id: eventId },
      body: { looking_for_members: true, looking_for: 'A designer' },
    });
    const listing = await call(board, {
      as: owner.id,
      params: { id: eventId },
      path: '/x?open=true',
    });
    const text = await listing.text();
    expect(text).not.toContain(team.invite_code);
    const items = (JSON.parse(text) as { items: unknown[] }).items.map((i) =>
      openTeamSchema.parse(i),
    );
    expect(items).toEqual([
      expect.objectContaining({ name: 'ClinicQ', looking_for: 'A designer', member_count: 2 }),
    ]);
  });

  it('refuses the board and teams to people who have not confirmed', async () => {
    const outsider = await fx.user('Outsider');
    await expectError(
      await call(board, { as: outsider.id, params: { id: eventId } }),
      403,
      'NOT_CONFIRMED',
    );
    await expectError(
      await call(createTeam, {
        method: 'POST',
        as: outsider.id,
        params: { id: eventId },
        body: { name: 'X' },
      }),
      403,
      'NOT_CONFIRMED',
    );
  });

  it('rotates the code so the old one stops working', async () => {
    const before = myTeamSchema.parse(
      await (await call(myTeam, { as: owner.id, params: { id: eventId } })).json(),
    );
    const after = myTeamSchema.parse(
      await (await call(rotate, { method: 'POST', as: mate.id, params: { id: eventId } })).json(),
    );
    expect(after.invite_code).not.toBe(before.invite_code);
    const newcomer = await fx.user('Newcomer');
    await confirmApplicant(sql, eventId, newcomer.id);
    await expectError(
      await call(joinTeam, {
        method: 'POST',
        as: newcomer.id,
        params: { id: eventId },
        body: { invite_code: before.invite_code },
      }),
      404,
      'INVALID_INVITE_CODE',
    );
  });

  it('lets only the owner remove a member, and lets members leave', async () => {
    await expectError(
      await call(removeMember, {
        method: 'DELETE',
        as: mate.id,
        params: { id: eventId, userId: owner.id },
      }),
      403,
      'FORBIDDEN',
    );
    const left = await call(leave, { method: 'POST', as: mate.id, params: { id: eventId } });
    expect(left.status).toBe(204);
    await expectError(
      await call(myTeam, { as: mate.id, params: { id: eventId } }),
      404,
      'NOT_ON_TEAM',
    );
  });

  it('gets RATE_LIMITED on the 11th join attempt in a minute', async () => {
    const guesser = await fx.user('Guesser');
    await confirmApplicant(sql, eventId, guesser.id);
    const attempt = () =>
      call(joinTeam, {
        method: 'POST',
        as: guesser.id,
        params: { id: eventId },
        body: { invite_code: 'AAAAAAAA' },
      });
    for (let i = 0; i < 10; i++) {
      await expectError(await attempt(), 404, 'INVALID_INVITE_CODE');
    }
    const limited = await expectError(await attempt(), 429, 'RATE_LIMITED');
    expect(limited.error.details).toHaveProperty('retry_after_seconds');
    await sql`delete from rate_limit_counters where key = ${`team_join:${guesser.id}`}`;
  });
});

// Phase 7: reports, soft delete and rate limits through the API, with refused roles.
import { getSql } from '@hx/db';
import { CIREN_ORG_ID, eventImpactSchema } from '@hx/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as apply } from '@/app/api/v1/events/[id]/applications/route';
import { GET as report } from '@/app/api/v1/events/[id]/reports/impact/route';
import { POST as restore } from '@/app/api/v1/events/[id]/restore/route';
import { DELETE as deleteEvent } from '@/app/api/v1/events/[id]/route';
import { DELETE as deleteTeam } from '@/app/api/v1/events/[id]/teams/[tid]/route';
import { GET as orgReport } from '@/app/api/v1/orgs/[orgId]/reports/impact/route';
import { call, expectError, fixtures } from './helpers';

const fx = fixtures();
const sql = getSql();
afterAll(() => fx.cleanup());

let eventId: string;
let people: Awaited<ReturnType<typeof fx.eventWithRoles>>['people'];

beforeAll(async () => {
  const result = await fx.eventWithRoles();
  eventId = result.event.id;
  people = result.people;
}, 60_000);

describe('impact reports', () => {
  it('gives owners and admins JSON and CSV, and refuses everyone else', async () => {
    const json = await call(report, { as: people.admin.id, params: { id: eventId } });
    expect(eventImpactSchema.parse(await json.json()).event_id).toBe(eventId);
    const csv = await call(report, {
      as: people.owner.id,
      params: { id: eventId },
      path: '/x?format=csv',
    });
    expect(csv.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(csv.headers.get('content-disposition')).toMatch(/^attachment; filename="impact-/);
    expect(await csv.text()).toContain('event,section,item,value');
    for (const role of ['judge', 'mentor', 'volunteer', 'participant'] as const) {
      await expectError(
        await call(report, { as: people[role].id, params: { id: eventId } }),
        403,
        'FORBIDDEN',
      );
    }
  });

  it('gives the organization report to org members only', async () => {
    await expectError(
      await call(orgReport, { as: people.participant.id, params: { orgId: CIREN_ORG_ID } }),
      403,
      'FORBIDDEN',
    );
    await sql`insert into org_members (org_id, user_id) values (${CIREN_ORG_ID}, ${people.admin.id})`;
    const response = await call(orgReport, {
      as: people.admin.id,
      params: { orgId: CIREN_ORG_ID },
      path: '/x?from=2031-01-01&to=2031-01-31',
    });
    expect(response.status).toBe(200);
    await sql`delete from org_members where user_id = ${people.admin.id}`;
  });
});

describe('soft delete', () => {
  it('lets only the owner delete a team or the event, and restore it', async () => {
    const tid = crypto.randomUUID();
    await expectError(
      await call(deleteTeam, {
        method: 'DELETE',
        as: people.admin.id,
        params: { id: eventId, tid },
      }),
      403,
      'FORBIDDEN',
    );
    await expectError(
      await call(deleteEvent, { method: 'DELETE', as: people.admin.id, params: { id: eventId } }),
      403,
      'FORBIDDEN',
    );
    const deleted = await call(deleteEvent, {
      method: 'DELETE',
      as: people.owner.id,
      params: { id: eventId },
    });
    expect(deleted.status).toBe(204);
    await expectError(
      await call(restore, { method: 'POST', as: people.admin.id, params: { id: eventId } }),
      404,
      'NOT_FOUND',
    );
    const restored = await call(restore, {
      method: 'POST',
      as: people.owner.id,
      params: { id: eventId },
    });
    expect(restored.status).toBe(204);
  });
});

describe('rate limits', () => {
  it('refuses the sixth application attempt in a minute', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const response = await call(apply, {
        method: 'POST',
        as: people.participant.id,
        params: { id: eventId },
        body: { answers: {} },
      });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 200 || s === 201)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});

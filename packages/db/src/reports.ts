import { toCsv, type CsvCell } from '@hx/core';
import { ApiError, type EventImpact, type ImpactFigures, type OrgImpact } from '@hx/shared';
import type { ISql } from './client';
import { iso } from './rows';

type Counts = ImpactFigures['demographics']['school'];

/** Demographic counts over checked-in participants of `eventIds`, for one fixed column. */
async function demographic(
  sql: ISql,
  eventIds: string[],
  column: 'school' | 'level_of_study' | 'country' | 'gender',
): Promise<Counts> {
  return sql<Counts>`
    select coalesce(nullif(btrim(p.${sql(column)}), ''), 'Not given') as value, count(*)::int as count
    from check_ins c join profiles p on p.user_id = c.user_id
    where c.event_id = any(${eventIds}::uuid[])
    group by 1
    order by count desc, value
  `;
}

/**
 * The impact figures for a set of events (one event, or an organization's range). Soft-deleted
 * teams and submissions never count (build plan Phase 7 item 4).
 */
async function figures(sql: ISql, eventIds: string[]): Promise<ImpactFigures> {
  const [row] = await sql<
    [
      Omit<ImpactFigures, 'demographics' | 'completion_rate' | 'median_response_minutes'> & {
        median: number | null;
      },
    ]
  >`
    select
      (select count(*)::int from applications where event_id = any(${eventIds}::uuid[])) as applicants,
      (select count(*)::int from applications where event_id = any(${eventIds}::uuid[])
         and status in ('accepted', 'confirmed', 'declined')) as accepted,
      (select count(*)::int from applications where event_id = any(${eventIds}::uuid[])
         and status = 'confirmed') as confirmed,
      (select count(*)::int from check_ins where event_id = any(${eventIds}::uuid[])) as checked_in,
      (select count(*)::int from teams t where t.event_id = any(${eventIds}::uuid[]) and t.deleted_at is null
         and exists (select 1 from team_members m where m.team_id = t.id)) as teams,
      (select count(*)::int from submissions s join teams t on t.id = s.team_id and t.deleted_at is null
         where s.event_id = any(${eventIds}::uuid[]) and s.status = 'submitted' and s.deleted_at is null) as submissions,
      (select count(*)::int from mentor_requests where event_id = any(${eventIds}::uuid[])) as mentor_requests,
      (select count(*)::int from mentor_requests where event_id = any(${eventIds}::uuid[])
         and status = 'resolved') as mentor_resolved,
      (select percentile_cont(0.5) within group (order by extract(epoch from claimed_at - created_at) / 60)
         from mentor_requests where event_id = any(${eventIds}::uuid[]) and claimed_at is not null) as median
  `;
  const [school, level, country, gender] = await Promise.all([
    demographic(sql, eventIds, 'school'),
    demographic(sql, eventIds, 'level_of_study'),
    demographic(sql, eventIds, 'country'),
    demographic(sql, eventIds, 'gender'),
  ]);
  const { median, ...counts } = row;
  return {
    ...counts,
    demographics: {
      school: [...school],
      level_of_study: [...level],
      country: [...country],
      gender: [...gender],
    },
    completion_rate:
      counts.teams > 0 ? Math.round((counts.submissions / counts.teams) * 1000) / 1000 : null,
    median_response_minutes: median === null ? null : Math.round(Number(median) * 10) / 10,
  };
}

/** GET /events/{id}/reports/impact */
export async function eventImpact(sql: ISql, eventId: string): Promise<EventImpact> {
  const [event] = await sql<[{ name: string; starts_at: Date }?]>`
    select name, starts_at from events where id = ${eventId} and deleted_at is null
  `;
  if (!event) throw new ApiError('NOT_FOUND', 'No such event.');
  return {
    event_id: eventId,
    event_name: event.name,
    starts_at: iso(event.starts_at),
    ...(await figures(sql, [eventId])),
  };
}

/**
 * GET /orgs/{orgId}/reports/impact?from=&to=: every event of the organization starting in the
 * range (dates, inclusive, UTC), each event's figures, totals across them, and returning
 * participants (checked in at more than one of these events).
 */
export async function orgImpact(
  sql: ISql,
  orgId: string,
  range: { from?: string | undefined; to?: string | undefined },
): Promise<OrgImpact> {
  const events = await sql<{ id: string }[]>`
    select id from events
    where organization_id = ${orgId} and deleted_at is null and status <> 'draft'
      ${range.from ? sql`and starts_at >= ${range.from}::date` : sql``}
      ${range.to ? sql`and starts_at < ${range.to}::date + 1` : sql``}
    order by starts_at, id
  `;
  const ids = events.map((e) => e.id);
  const [perEvent, totals, [returning]] = await Promise.all([
    Promise.all(ids.map((id) => eventImpact(sql, id))),
    figures(sql, ids),
    sql<[{ count: number }]>`
      select count(*)::int as count from (
        select user_id from check_ins where event_id = any(${ids}::uuid[])
        group by user_id having count(distinct event_id) > 1
      ) r
    `,
  ]);
  return {
    org_id: orgId,
    from: range.from ?? null,
    to: range.to ?? null,
    events: perEvent,
    totals,
    returning_participants: returning.count,
  };
}

function figureRows(scope: string, f: ImpactFigures): CsvCell[][] {
  const rows: CsvCell[][] = [
    [scope, 'overview', 'applicants', f.applicants],
    [scope, 'overview', 'accepted', f.accepted],
    [scope, 'overview', 'confirmed', f.confirmed],
    [scope, 'overview', 'checked in', f.checked_in],
    [scope, 'overview', 'teams', f.teams],
    [scope, 'overview', 'submissions', f.submissions],
    [scope, 'overview', 'completion rate', f.completion_rate],
    [scope, 'overview', 'mentor requests', f.mentor_requests],
    [scope, 'overview', 'mentor requests resolved', f.mentor_resolved],
    [scope, 'overview', 'median minutes to a mentor', f.median_response_minutes],
  ];
  for (const [section, counts] of Object.entries(f.demographics)) {
    for (const { value, count } of counts)
      rows.push([scope, section.replace(/_/g, ' '), value, count]);
  }
  return rows;
}

/** The event report as CSV: event, section, item, value. */
export function eventImpactCsv(report: EventImpact): string {
  return toCsv([['event', 'section', 'item', 'value'], ...figureRows(report.event_name, report)]);
}

/** The organization report as CSV: each event, then "All events" totals. */
export function orgImpactCsv(report: OrgImpact): string {
  return toCsv([
    ['event', 'section', 'item', 'value'],
    ...report.events.flatMap((e) => figureRows(e.event_name, e)),
    ...figureRows('All events', report.totals),
    ['All events', 'overview', 'returning participants', report.returning_participants],
  ]);
}

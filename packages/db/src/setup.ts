import {
  ApiError,
  type Award,
  type EventSetup,
  type RubricCriterion,
  type ScheduleItem,
  type Track,
} from '@hx/shared';
import { audit } from './audit';
import type { ISql } from './client';
import type { Json } from './database.types';
import { iso } from './rows';

/** The four setup lists organizers edit: tracks, schedule, rubric, awards. */
export type SetupKind = 'tracks' | 'schedule' | 'rubric' | 'awards';

interface SetupTable {
  table: string;
  columns: readonly string[];
  /** SQL ORDER BY, fixed per table (never from input). */
  order: string;
  entity: string;
}

const TABLES: Record<SetupKind, SetupTable> = {
  tracks: { table: 'tracks', columns: ['name', 'description'], order: 'name, id', entity: 'track' },
  schedule: {
    table: 'schedule_items',
    columns: ['title', 'starts_at', 'ends_at', 'location'],
    order: 'starts_at, title, id',
    entity: 'schedule_item',
  },
  rubric: {
    table: 'rubric_criteria',
    columns: ['name', 'description', 'max_score', 'weight', 'position', 'is_tiebreaker'],
    order: 'position, name, id',
    entity: 'rubric_criterion',
  },
  awards: {
    table: 'awards',
    columns: ['name', 'track_id', 'rank'],
    order: 'rank nulls last, name, id',
    entity: 'award',
  },
};

type SetupItem = Track | ScheduleItem | RubricCriterion | Award;
type Row = Record<string, unknown> & { id: string };

function toItem(kind: SetupKind, row: Row): SetupItem {
  switch (kind) {
    case 'tracks':
      return { id: row.id, name: row.name as string, description: row.description as string };
    case 'schedule':
      return {
        id: row.id,
        title: row.title as string,
        starts_at: iso(row.starts_at as Date),
        ends_at: iso(row.ends_at as Date | null),
        location: row.location as string | null,
      };
    case 'rubric':
      return {
        id: row.id,
        name: row.name as string,
        description: row.description as string,
        max_score: row.max_score as number,
        weight: Number(row.weight),
        position: row.position as number,
        is_tiebreaker: row.is_tiebreaker as boolean,
      };
    case 'awards':
      return {
        id: row.id,
        track_id: row.track_id as string | null,
        name: row.name as string,
        rank: row.rank as number | null,
      };
  }
}

async function listKind(sql: ISql, kind: SetupKind, eventId: string): Promise<SetupItem[]> {
  const { table, columns, order } = TABLES[kind];
  const rows = await sql.unsafe<Row[]>(
    `select id, ${columns.join(', ')} from ${table} where event_id = $1 order by ${order}`,
    [eventId],
  );
  return rows.map((row) => toItem(kind, row));
}

/** GET /events/{id}/setup */
export async function getEventSetup(sql: ISql, eventId: string): Promise<EventSetup> {
  const [tracks, schedule, rubric, awards] = await Promise.all([
    listKind(sql, 'tracks', eventId),
    listKind(sql, 'schedule', eventId),
    listKind(sql, 'rubric', eventId),
    listKind(sql, 'awards', eventId),
  ]);
  return {
    tracks: tracks as Track[],
    schedule: schedule as ScheduleItem[],
    rubric: rubric as RubricCriterion[],
    awards: awards as Award[],
  };
}

/** Values already validated by the shared Zod schema for this kind. Run inside tx(). */
export async function createSetupItem(
  sql: ISql,
  kind: SetupKind,
  eventId: string,
  values: Record<string, unknown>,
): Promise<SetupItem> {
  await assertSetupEditable(sql, kind, eventId);
  const { table, columns } = TABLES[kind];
  const clean = pick(values, columns);
  await checkRules(sql, kind, eventId, clean, null);
  const [row] = await sql<[Row]>`
    insert into ${sql(table)} ${sql({ ...clean, event_id: eventId } as never)}
    returning id, ${sql(columns)}
  `;
  return toItem(kind, row);
}

export async function updateSetupItem(
  sql: ISql,
  kind: SetupKind,
  eventId: string,
  itemId: string,
  values: Record<string, unknown>,
): Promise<SetupItem> {
  await assertSetupEditable(sql, kind, eventId);
  const { table, columns } = TABLES[kind];
  const clean = pick(values, columns);
  const [current] = await sql<[Row?]>`
    select id, ${sql(columns)} from ${sql(table)}
    where id = ${itemId} and event_id = ${eventId}
    for update
  `;
  if (!current) throw new ApiError('NOT_FOUND', 'No such item.');
  await checkRules(sql, kind, eventId, clean, current);
  if (Object.keys(clean).length === 0) return toItem(kind, current);

  const [row] = await sql<[Row]>`
    update ${sql(table)} set ${sql(clean as never)}
    where id = ${itemId} and event_id = ${eventId}
    returning id, ${sql(columns)}
  `;
  return toItem(kind, row);
}

/** Deletes are audited (Agent rule 15). An item still referenced (a track with awards) is refused. */
export async function deleteSetupItem(
  sql: ISql,
  kind: SetupKind,
  eventId: string,
  itemId: string,
  actorId: string,
): Promise<void> {
  await assertSetupEditable(sql, kind, eventId);
  const { table, columns, entity } = TABLES[kind];
  if (kind === 'tracks') {
    const used = await sql`select 1 from awards where track_id = ${itemId}`;
    if (used.length > 0) {
      throw new ApiError(
        'CONFLICT',
        'An award belongs to this track. Delete or move the award first.',
      );
    }
  }
  const [row] = await sql<[Row?]>`
    delete from ${sql(table)} where id = ${itemId} and event_id = ${eventId}
    returning id, ${sql(columns)}
  `;
  if (!row) throw new ApiError('NOT_FOUND', 'No such item.');
  await audit(sql, {
    eventId,
    actorId,
    action: `${entity}.deleted`,
    entityType: entity,
    entityId: itemId,
    before: JSON.parse(JSON.stringify(toItem(kind, row))) as Json,
  });
}

/**
 * The rubric is fixed once judging starts (scores depend on it), and awards once results are
 * published (badges come from them).
 */
async function assertSetupEditable(sql: ISql, kind: SetupKind, eventId: string): Promise<void> {
  if (kind !== 'rubric' && kind !== 'awards') return;
  const [event] = await sql<[{ status: string }?]>`
    select status from events where id = ${eventId} for share
  `;
  if (kind === 'rubric' && (event?.status === 'judging' || event?.status === 'completed')) {
    throw new ApiError('CONFLICT', 'The rubric is fixed once judging starts.');
  }
  if (kind === 'awards' && event?.status === 'completed') {
    throw new ApiError('RESULTS_PUBLISHED', 'Results are published, so awards are final.');
  }
}

function pick(
  values: Record<string, unknown>,
  columns: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([key, v]) => columns.includes(key) && v !== undefined),
  );
}

async function checkRules(
  sql: ISql,
  kind: SetupKind,
  eventId: string,
  values: Record<string, unknown>,
  current: Row | null,
): Promise<void> {
  if (kind === 'schedule') {
    const starts = (values.starts_at as string | undefined) ?? iso(current?.starts_at as Date);
    const ends =
      values.ends_at === undefined
        ? iso((current?.ends_at as Date | null) ?? null)
        : values.ends_at;
    if (ends && starts && new Date(ends as string) <= new Date(starts)) {
      throw ApiError.validation('Some fields need fixing.', {
        ends_at: 'Must be after the start.',
      });
    }
  }
  if (kind === 'awards' && values.track_id) {
    const track =
      await sql`select 1 from tracks where id = ${values.track_id as string} and event_id = ${eventId}`;
    if (track.length === 0) {
      throw ApiError.validation('Some fields need fixing.', {
        track_id: 'Choose a track from this event.',
      });
    }
  }
  if (kind === 'rubric' && values.is_tiebreaker === true) {
    // One tiebreaker per event: choosing a new one clears the old one.
    await sql`
      update rubric_criteria set is_tiebreaker = false
      where event_id = ${eventId} and is_tiebreaker and id is distinct from ${current?.id ?? null}
    `;
  }
}

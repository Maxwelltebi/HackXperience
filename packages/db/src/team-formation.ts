import { autoGroup, generateInviteCode } from '@hx/core';
import {
  ApiError,
  type DraftTeam,
  type FormationPerson,
  type PublishDraftResult,
  type TeamDraft,
  type TeamFormation,
} from '@hx/shared';
import { audit } from './audit';
import type { ISql } from './client';
import { lockEventForDeadline } from './guards';
import { broadcastStaffCounts } from './live';
import { iso } from './rows';

/*
 * Organizer team forming (R36). Owners and admins group confirmed participants who have no
 * team into balanced teams from their skill ratings. The result is a draft that only they see:
 * they move people, rename teams, then publish. Publishing creates ordinary teams; participants
 * who formed their own teams are never touched.
 */

interface DraftRow {
  teams: DraftTeam[];
  version: number;
  updated_at: Date;
}

function toDraft(row: DraftRow): TeamDraft {
  return { teams: row.teams, version: row.version, updated_at: iso(row.updated_at) };
}

/**
 * Confirmed participants on no team. Members of a deleted team stay attached to it (Q27), so
 * they aren't in the pool either.
 */
async function loadPool(sql: ISql, eventId: string): Promise<FormationPerson[]> {
  return sql<FormationPerson[]>`
    select a.user_id, u.name, p.school, a.skill_ratings
    from applications a
    join users u on u.id = a.user_id
    join profiles p on p.user_id = a.user_id
    where a.event_id = ${eventId} and a.status = 'confirmed'
      and not exists (select 1 from team_members m
                      where m.event_id = a.event_id and m.user_id = a.user_id)
    order by u.name, a.user_id
  `;
}

async function loadDraft(sql: ISql, eventId: string, lock = false): Promise<DraftRow | null> {
  const [row] = await sql<[DraftRow?]>`
    select teams, version, updated_at from team_drafts where event_id = ${eventId}
    ${lock ? sql`for update` : sql``}
  `;
  return row ?? null;
}

/** GET /events/{id}/team-formation: the people to place and the current draft. */
export async function getTeamFormation(sql: ISql, eventId: string): Promise<TeamFormation> {
  const [[sizes], pool, draft] = await Promise.all([
    sql<[{ team_size_min: number; team_size_max: number }]>`
      select team_size_min, team_size_max from events where id = ${eventId}
    `,
    loadPool(sql, eventId),
    loadDraft(sql, eventId),
  ]);
  return {
    pool,
    draft: draft ? toDraft(draft) : null,
    team_size_min: sizes.team_size_min,
    team_size_max: sizes.team_size_max,
  };
}

/** Saves `teams` if `version` is the draft's current one (0 = no draft yet). Run inside tx(). */
async function writeDraft(
  sql: ISql,
  eventId: string,
  actorId: string,
  version: number,
  teams: DraftTeam[],
): Promise<DraftRow> {
  const current = await loadDraft(sql, eventId, true);
  if ((current?.version ?? 0) !== version) {
    throw new ApiError(
      'STALE_VERSION',
      'Someone else changed the draft. Reload to see their version.',
      { current_version: current?.version ?? 0 },
    );
  }
  const [row] = await sql<[DraftRow]>`
    insert into team_drafts (event_id, teams, version, updated_by, updated_at)
    values (${eventId}, ${sql.json(teams as never)}, 1, ${actorId}, now())
    on conflict (event_id) do update
      set teams = excluded.teams, version = team_drafts.version + 1,
          updated_by = excluded.updated_by, updated_at = now()
    returning teams, version, updated_at
  `;
  return row;
}

/**
 * POST /events/{id}/team-formation/auto: balanced teams of at most `teamSize` from everyone in
 * the pool, saved as the draft (replacing the previous one). Run inside tx().
 */
export async function autoGroupDraft(
  sql: ISql,
  eventId: string,
  actorId: string,
  teamSize: number,
  version: number,
): Promise<TeamFormation> {
  const event = await lockEventForDeadline(sql, eventId);
  if (teamSize < event.team_size_min || teamSize > event.team_size_max) {
    throw ApiError.validation('Pick a team size this event allows.', {
      team_size: `From ${event.team_size_min} to ${event.team_size_max}.`,
    });
  }
  const pool = await loadPool(sql, eventId);
  if (pool.length === 0) {
    throw new ApiError('INVALID_TRANSITION', 'Everyone who confirmed is already on a team.');
  }
  const groups = autoGroup(
    pool.map((p) => ({ id: p.user_id, ratings: p.skill_ratings })),
    teamSize,
  );
  const teams = groups.map((member_ids, i) => ({ name: `Team ${i + 1}`, member_ids }));
  await writeDraft(sql, eventId, actorId, version, teams);
  return getTeamFormation(sql, eventId);
}

/**
 * PUT /events/{id}/team-formation/draft: the organizers' edits (people moved, teams renamed,
 * added or removed). Everyone in it must be a confirmed participant of this event. Run inside tx().
 */
export async function saveTeamDraft(
  sql: ISql,
  eventId: string,
  actorId: string,
  version: number,
  teams: DraftTeam[],
): Promise<TeamFormation> {
  await lockEventForDeadline(sql, eventId);
  const ids = teams.flatMap((t) => t.member_ids);
  if (ids.length > 0) {
    const found = await sql<{ user_id: string }[]>`
      select user_id from applications
      where event_id = ${eventId} and status = 'confirmed' and user_id = any(${ids}::uuid[])
    `;
    if (found.length !== new Set(ids).size) {
      throw ApiError.validation('Some people in the draft are not confirmed participants.', {
        teams: 'Reload the page: someone lost their place.',
      });
    }
  }
  await writeDraft(sql, eventId, actorId, version, teams);
  return getTeamFormation(sql, eventId);
}

/** DELETE /events/{id}/team-formation/draft. Run inside tx(). */
export async function discardTeamDraft(sql: ISql, eventId: string): Promise<TeamFormation> {
  await sql`delete from team_drafts where event_id = ${eventId}`;
  return getTeamFormation(sql, eventId);
}

/**
 * POST /events/{id}/team-formation/publish: creates the draft's teams (Agent rule 7: event row
 * FOR SHARE first, refused after the deadline), emails each member, audits each team, and
 * deletes the draft. People who joined a team or lost their place since the draft was made are
 * left out and reported. The first member placed owns the team. Run inside tx().
 */
export async function publishTeamDraft(
  sql: ISql,
  eventId: string,
  actorId: string,
  version: number,
): Promise<PublishDraftResult> {
  await lockEventForDeadline(sql, eventId);
  const draft = await loadDraft(sql, eventId, true);
  if (!draft) throw new ApiError('NOT_FOUND', 'There is no draft to publish.');
  if (draft.version !== version) {
    throw new ApiError(
      'STALE_VERSION',
      'Someone else changed the draft. Reload to see their version.',
      { current_version: draft.version },
    );
  }

  const placeable = new Set((await loadPool(sql, eventId)).map((p) => p.user_id));
  const allIds = draft.teams.flatMap((t) => t.member_ids);
  const names = new Map(
    (
      await sql<{ id: string; name: string }[]>`
        select id, name from users where id = any(${allIds}::uuid[])
      `
    ).map((u) => [u.id, u.name]),
  );
  const result: PublishDraftResult = { teams: 0, placed: 0, skipped: [] };

  for (const team of draft.teams) {
    const members = team.member_ids.filter((id) => placeable.has(id));
    for (const id of team.member_ids) {
      if (!placeable.has(id)) result.skipped.push({ user_id: id, name: names.get(id) ?? '' });
    }
    if (members.length === 0) continue;
    const owner = members[0] as string;
    const [created] = await sql<[{ id: string }]>`
      insert into teams (id, event_id, name, invite_code, owner_id)
      values (gen_random_uuid(), ${eventId}, ${team.name}, ${await freeCode(sql)}, ${owner})
      returning id
    `;
    // UNIQUE (event_id, user_id) is the backstop if someone joined a team a moment ago.
    const inserted = await sql<{ user_id: string }[]>`
      insert into team_members (team_id, event_id, user_id)
      select ${created.id}, ${eventId}, x.user_id from unnest(${members}::uuid[]) as x(user_id)
      on conflict (event_id, user_id) do nothing
      returning user_id
    `;
    const placed = new Set(inserted.map((r) => r.user_id));
    for (const id of members) {
      if (!placed.has(id)) result.skipped.push({ user_id: id, name: names.get(id) ?? '' });
    }
    if (placed.size === 0) {
      await sql`delete from teams where id = ${created.id}`;
      continue;
    }
    const placedIds = members.filter((id) => placed.has(id));
    if (!placed.has(owner)) {
      await sql`update teams set owner_id = ${placedIds[0] as string} where id = ${created.id}`;
    }
    await audit(sql, {
      eventId,
      actorId,
      action: 'team.formed',
      entityType: 'team',
      entityId: created.id,
      before: null,
      after: { name: team.name, member_ids: placedIds },
    });
    // Agent rule 16: the email goes through the outbox, in this transaction.
    await sql`
      insert into notification_outbox (user_id, channel, template, payload, dedupe_key)
      select x.user_id, 'email', 'team_assigned',
             jsonb_build_object('event_id', ${eventId}::uuid, 'team_id', ${created.id}::uuid),
             'team_assigned:' || ${created.id}::text || ':' || x.user_id::text
      from unnest(${placedIds}::uuid[]) as x(user_id)
      on conflict (dedupe_key) do nothing
    `;
    result.teams += 1;
    result.placed += placed.size;
  }

  await sql`delete from team_drafts where event_id = ${eventId}`;
  await broadcastStaffCounts(sql, eventId);
  return result;
}

async function freeCode(sql: ISql): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    const taken = await sql`select 1 from teams where invite_code = ${code}`;
    if (taken.length === 0) return code;
  }
  throw new Error('could not find a free invite code');
}

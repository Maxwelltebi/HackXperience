import { generateInviteCode, normalizeInviteCode } from '@hx/core';
import { ApiError, type MyTeam, type OpenTeam } from '@hx/shared';
import { audit } from './audit';
import { PostgresError, type ISql } from './client';
import { lockEventForDeadline, requireConfirmed } from './guards';
import { broadcast, liveVersion } from './live';
import { iso } from './rows';
import { liveTopics } from '@hx/shared';

/** Hints a team's channel that its members changed (DESIGN: member joined or left). */
async function teamChanged(sql: ISql, teamId: string): Promise<void> {
  await broadcast(sql, liveTopics.team(teamId), {
    type: 'team.changed',
    version: await liveVersion(sql),
  });
}

interface TeamRow {
  id: string;
  event_id: string;
  name: string;
  invite_code: string;
  owner_id: string;
  looking_for_members: boolean;
  looking_for: string | null;
  created_at: Date;
}

const TEAM_COLUMNS = [
  'id',
  'event_id',
  'name',
  'invite_code',
  'owner_id',
  'looking_for_members',
  'looking_for',
  'created_at',
] as const;

/**
 * The second insert of a race on UNIQUE (event_id, user_id) fails with this constraint;
 * it means the person joined another team at the same moment (DESIGN Step 6 part 2).
 */
const ONE_TEAM_CONSTRAINT = 'team_members_event_id_user_id_key';

/** Runs a team write and turns the one-team-per-event violation into ALREADY_ON_TEAM. */
export async function withTeamErrors<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof PostgresError && error.constraint_name === ONE_TEAM_CONSTRAINT) {
      throw alreadyOnTeam();
    }
    throw error;
  }
}

function alreadyOnTeam(): ApiError {
  return new ApiError('ALREADY_ON_TEAM', "You're already on a team at this event. Leave it first.");
}

// ---------- Reads ----------

/** The caller's team at this event, with members, or null. */
export async function getMyTeam(
  sql: ISql,
  eventId: string,
  userId: string,
): Promise<MyTeam | null> {
  const [team] = await sql<[(TeamRow & { team_size_max: number })?]>`
    select ${sql(TEAM_COLUMNS.map((c) => `t.${c}`))}, e.team_size_max
    from team_members m
    join teams t on t.id = m.team_id and t.deleted_at is null
    join events e on e.id = t.event_id
    where m.event_id = ${eventId} and m.user_id = ${userId}
  `;
  if (!team) return null;
  const members = await sql<
    { user_id: string; name: string; school: string | null; joined_at: Date }[]
  >`
    select m.user_id, u.name, p.school, m.joined_at
    from team_members m
    join users u on u.id = m.user_id
    join profiles p on p.user_id = m.user_id
    where m.team_id = ${team.id}
    order by m.joined_at, m.user_id
  `;
  return {
    id: team.id,
    event_id: team.event_id,
    name: team.name,
    invite_code: team.invite_code,
    owner_id: team.owner_id,
    looking_for_members: team.looking_for_members,
    looking_for: team.looking_for,
    team_size_max: team.team_size_max,
    created_at: iso(team.created_at),
    members: members.map((m) => ({ ...m, joined_at: iso(m.joined_at) })),
  };
}

/** The find-a-team board: teams asking for members that still have room. No invite codes. */
export async function listOpenTeams(sql: ISql, eventId: string): Promise<OpenTeam[]> {
  const rows = await sql<
    {
      id: string;
      name: string;
      looking_for: string | null;
      members: { name: string; school: string | null }[];
    }[]
  >`
    select t.id, t.name, t.looking_for,
           coalesce(
             json_agg(json_build_object('name', u.name, 'school', p.school) order by m.joined_at),
             '[]'
           ) as members
    from teams t
    join events e on e.id = t.event_id
    join team_members m on m.team_id = t.id
    join users u on u.id = m.user_id
    join profiles p on p.user_id = m.user_id
    where t.event_id = ${eventId} and t.deleted_at is null and t.looking_for_members
    group by t.id, e.team_size_max
    having count(m.user_id) < e.team_size_max
    order by t.created_at desc
  `;
  return rows.map((row) => ({ ...row, member_count: row.members.length }));
}

// ---------- Writes (run inside tx(), wrapped in withTeamErrors) ----------

/**
 * POST /events/{id}/teams. The creator becomes owner and first member. `teamId` may come from
 * the client (Agent rule 14): repeating the same create returns the team instead of a duplicate.
 */
export async function createTeam(
  sql: ISql,
  eventId: string,
  userId: string,
  teamId: string,
  name: string,
): Promise<MyTeam> {
  await lockEventForDeadline(sql, eventId);
  await requireConfirmed(sql, eventId, userId);

  const [existing] = await sql<[{ event_id: string; owner_id: string }?]>`
    select event_id, owner_id from teams where id = ${teamId}
  `;
  if (existing) {
    const mine = existing.event_id === eventId && existing.owner_id === userId;
    const team = mine ? await getMyTeam(sql, eventId, userId) : null;
    if (team) return team;
    throw new ApiError('CONFLICT', 'That team id is already used.');
  }
  if (await isOnTeam(sql, eventId, userId)) throw alreadyOnTeam();

  const code = await freeInviteCode(sql);
  await sql`
    insert into teams (id, event_id, name, invite_code, owner_id)
    values (${teamId}, ${eventId}, ${name}, ${code}, ${userId})
  `;
  await sql`insert into team_members (team_id, event_id, user_id) values (${teamId}, ${eventId}, ${userId})`;
  return mustGetMyTeam(sql, eventId, userId);
}

/**
 * POST /events/{id}/teams/join, exactly as DESIGN Step 6 part 2: event row FOR SHARE, team row
 * FOR UPDATE (serializing joins to this team), count, insert. A concurrent join to a different
 * team by the same person fails on UNIQUE (event_id, user_id) → ALREADY_ON_TEAM.
 */
export async function joinTeam(
  sql: ISql,
  eventId: string,
  userId: string,
  rawCode: string,
): Promise<MyTeam> {
  const event = await lockEventForDeadline(sql, eventId);
  await requireConfirmed(sql, eventId, userId);

  const code = normalizeInviteCode(rawCode);
  const [team] = code
    ? await sql<[{ id: string }?]>`
        select id from teams
        where invite_code = ${code} and event_id = ${eventId} and deleted_at is null
        for update
      `
    : [];
  if (!team)
    throw new ApiError('INVALID_INVITE_CODE', 'No team at this event has that invite code.');

  const [{ members, mine }] = await sql<[{ members: number; mine: boolean }]>`
    select count(*)::int as members, bool_or(user_id = ${userId}) as mine
    from team_members where team_id = ${team.id}
  `;
  if (mine) return mustGetMyTeam(sql, eventId, userId);
  if (await isOnTeam(sql, eventId, userId)) throw alreadyOnTeam();
  if (members >= event.team_size_max) {
    throw new ApiError('TEAM_FULL', `This team already has ${event.team_size_max} people.`);
  }

  await sql`insert into team_members (team_id, event_id, user_id) values (${team.id}, ${eventId}, ${userId})`;
  await teamChanged(sql, team.id);
  return mustGetMyTeam(sql, eventId, userId);
}

/**
 * POST /events/{id}/teams/me/leave. Ownership passes to the earliest joiner; the last member
 * leaving soft-deletes the team (audited).
 */
export async function leaveTeam(sql: ISql, eventId: string, userId: string): Promise<null> {
  await lockEventForDeadline(sql, eventId);
  const team = await lockMyTeam(sql, eventId, userId);

  await sql`delete from team_members where team_id = ${team.id} and user_id = ${userId}`;
  const remaining = await sql<{ user_id: string }[]>`
    select user_id from team_members where team_id = ${team.id} order by joined_at, user_id
  `;
  const next = remaining[0];
  if (!next) {
    await sql`update teams set deleted_at = now() where id = ${team.id}`;
    await audit(sql, {
      eventId,
      actorId: userId,
      action: 'team.deleted',
      entityType: 'team',
      entityId: team.id,
      before: { name: team.name, reason: 'last member left' },
    });
  } else if (team.owner_id === userId) {
    await sql`update teams set owner_id = ${next.user_id} where id = ${team.id}`;
  }
  await teamChanged(sql, team.id);
  return null;
}

/** DELETE /events/{id}/teams/me/members/{userId}: the team owner removes someone. Audited. */
export async function removeTeamMember(
  sql: ISql,
  eventId: string,
  ownerId: string,
  memberId: string,
): Promise<MyTeam> {
  await lockEventForDeadline(sql, eventId);
  const team = await lockMyTeam(sql, eventId, ownerId);
  if (team.owner_id !== ownerId)
    throw new ApiError('FORBIDDEN', 'Only the team owner can remove members.');
  if (memberId === ownerId) {
    throw ApiError.validation('Use Leave team to leave your own team.', {
      user_id: 'That is you.',
    });
  }
  const removed = await sql`
    delete from team_members where team_id = ${team.id} and user_id = ${memberId} returning user_id
  `;
  if (removed.length === 0) throw new ApiError('NOT_FOUND', "That person isn't on your team.");
  await audit(sql, {
    eventId,
    actorId: ownerId,
    action: 'team.member_removed',
    entityType: 'team',
    entityId: team.id,
    before: { user_id: memberId },
  });
  await teamChanged(sql, team.id);
  return mustGetMyTeam(sql, eventId, ownerId);
}

/** POST /events/{id}/teams/me/invite-code/rotate: any member; the old code stops working. */
export async function rotateInviteCode(
  sql: ISql,
  eventId: string,
  userId: string,
): Promise<MyTeam> {
  const team = await lockMyTeam(sql, eventId, userId);
  const code = await freeInviteCode(sql);
  await sql`update teams set invite_code = ${code} where id = ${team.id}`;
  return mustGetMyTeam(sql, eventId, userId);
}

/** PATCH /events/{id}/teams/me: team name and find-a-team board fields. Any member. */
export async function updateTeam(
  sql: ISql,
  eventId: string,
  userId: string,
  patch: { name?: string; looking_for_members?: boolean; looking_for?: string | null },
): Promise<MyTeam> {
  const team = await lockMyTeam(sql, eventId, userId);
  const changes = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (Object.keys(changes).length > 0) {
    await sql`update teams set ${sql(changes as Record<string, string | boolean | null>)} where id = ${team.id}`;
  }
  return mustGetMyTeam(sql, eventId, userId);
}

// ---------- Helpers ----------

async function isOnTeam(sql: ISql, eventId: string, userId: string): Promise<boolean> {
  const rows =
    await sql`select 1 from team_members where event_id = ${eventId} and user_id = ${userId}`;
  return rows.length > 0;
}

/**
 * The caller's team row, locked FOR UPDATE (after the event lock: Agent rule 8). Membership
 * is checked again after the lock, since a removal may have committed in between.
 */
export async function lockMyTeam(sql: ISql, eventId: string, userId: string): Promise<TeamRow> {
  const [membership] = await sql<[{ team_id: string }?]>`
    select team_id from team_members where event_id = ${eventId} and user_id = ${userId}
  `;
  if (!membership) throw new ApiError('NOT_ON_TEAM', "You're not on a team at this event.");
  const [team] = await sql<[TeamRow?]>`
    select ${sql(TEAM_COLUMNS)} from teams
    where id = ${membership.team_id} and deleted_at is null
    for update
  `;
  const still = await sql`
    select 1 from team_members where team_id = ${membership.team_id} and user_id = ${userId}
  `;
  if (!team || still.length === 0)
    throw new ApiError('NOT_ON_TEAM', "You're not on a team at this event.");
  return team;
}

async function mustGetMyTeam(sql: ISql, eventId: string, userId: string): Promise<MyTeam> {
  const team = await getMyTeam(sql, eventId, userId);
  if (!team) throw new Error('team vanished inside its own transaction');
  return team;
}

/** A code no team uses. Collisions are rare (8.5 × 10^11 codes); the unique index is the backstop. */
async function freeInviteCode(sql: ISql): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    const taken = await sql`select 1 from teams where invite_code = ${code}`;
    if (taken.length === 0) return code;
  }
  throw new Error('could not find a free invite code');
}

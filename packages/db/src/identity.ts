import type {
  MeResponse,
  PatchProfileBody,
  PublicProfile,
  PushToken,
  RegisterPushTokenBody,
} from '@hx/shared';
import type { ISql } from './client';

interface MeRow {
  id: string;
  email: string;
  name: string;
  is_platform_admin: boolean;
  created_at: Date;
  bio: string | null;
  avatar_url: string | null;
  github_username: string | null;
  school: string | null;
  level_of_study: string | null;
  graduation_year: number | null;
  country: string | null;
  gender: string | null;
  timezone: string;
  email_reminders: boolean;
}

const PROFILE_COLUMNS = [
  'bio',
  'avatar_url',
  'github_username',
  'school',
  'level_of_study',
  'graduation_year',
  'country',
  'gender',
  'timezone',
  'email_reminders',
] as const;

type ProfileColumn = (typeof PROFILE_COLUMNS)[number];
type ProfileChanges = Partial<Record<ProfileColumn, string | number | boolean | null>>;

/** The signed-in user's account and profile, or null if there is no such user. */
export async function getMe(sql: ISql, userId: string): Promise<MeResponse | null> {
  const [row] = await sql<[MeRow?]>`
    select u.id, u.email, u.name, u.is_platform_admin, u.created_at,
           p.bio, p.avatar_url, p.github_username, p.school, p.level_of_study,
           p.graduation_year, p.country, p.gender, p.timezone, p.email_reminders
    from users u
    join profiles p on p.user_id = u.id
    where u.id = ${userId}
  `;
  if (!row) return null;
  const [roles, orgs] = await Promise.all([
    sql<{ event_id: string; roles: MeResponse['event_roles'][number]['roles'] }[]>`
      select s.event_id, array_agg(s.role::text order by s.role) as roles
      from event_staff s join events e on e.id = s.event_id
      where s.user_id = ${userId} and e.deleted_at is null
      group by s.event_id
    `,
    sql<{ org_id: string }[]>`select org_id from org_members where user_id = ${userId}`,
  ]);
  return toMe(
    row,
    roles.map((r) => ({ event_id: r.event_id, roles: r.roles })),
    orgs.map((o) => o.org_id),
  );
}

/**
 * Apply a validated PATCH /me/profile body. `name` lives on users; everything else on profiles.
 * Run inside tx() so both updates land together. Returns null if the user does not exist.
 */
export async function updateProfile(
  sql: ISql,
  userId: string,
  patch: PatchProfileBody,
): Promise<MeResponse | null> {
  if (patch.name !== undefined) {
    await sql`update users set name = ${patch.name} where id = ${userId}`;
  }

  const changes = pickProfileChanges(patch);
  const columns = Object.keys(changes) as ProfileColumn[];
  if (columns.length > 0) {
    await sql`update profiles set ${sql(changes, columns)} where user_id = ${userId}`;
  }

  return getMe(sql, userId);
}

function pickProfileChanges(patch: PatchProfileBody): ProfileChanges {
  const changes: ProfileChanges = {};
  for (const column of PROFILE_COLUMNS) {
    if (patch[column] !== undefined) {
      changes[column] = patch[column];
    }
  }
  return changes;
}

interface PublicProfileRow {
  id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  github_username: string | null;
  school: string | null;
}

/** Public profile, with winner badges from events whose results are published. */
export async function getPublicProfile(sql: ISql, userId: string): Promise<PublicProfile | null> {
  const [row] = await sql<[PublicProfileRow?]>`
    select u.id, u.name, p.avatar_url, p.bio, p.github_username, p.school
    from users u
    join profiles p on p.user_id = u.id
    where u.id = ${userId}
  `;
  if (!row) return null;
  // Badges are computed (DESIGN Step 3 decision 4), and only for published results.
  const badges = await sql<PublicProfile['badges']>`
    select a.id as award_id, a.name as award_name, e.id as event_id, e.name as event_name,
           e.slug as event_slug, t.name as team_name
    from team_members m
    join teams t on t.id = m.team_id
    join award_winners w on w.team_id = t.id
    join awards a on a.id = w.award_id
    join events e on e.id = a.event_id and e.status = 'completed' and e.deleted_at is null
    where m.user_id = ${userId}
    order by e.starts_at desc, a.rank nulls last, a.name
  `;
  return { ...row, badges: [...badges] };
}

interface PushTokenRow {
  token: string;
  platform: PushToken['platform'];
  created_at: Date;
}

/**
 * Register a device's push token for this user. A token already registered to
 * someone else moves to this user: the device now belongs to whoever signed in on it.
 */
export async function upsertPushToken(
  sql: ISql,
  userId: string,
  body: RegisterPushTokenBody,
): Promise<PushToken> {
  const [row] = await sql<[PushTokenRow]>`
    insert into push_tokens (token, user_id, platform)
    values (${body.token}, ${userId}, ${body.platform})
    on conflict (token) do update
      set user_id = excluded.user_id, platform = excluded.platform
    returning token, platform, created_at
  `;
  return { token: row.token, platform: row.platform, created_at: row.created_at.toISOString() };
}

/** Remove one of this user's push tokens. Removing a token that is not theirs does nothing. */
export async function deletePushToken(sql: ISql, userId: string, token: string): Promise<void> {
  await sql`delete from push_tokens where token = ${token} and user_id = ${userId}`;
}

function toMe(row: MeRow, eventRoles: MeResponse['event_roles'], orgIds: string[]): MeResponse {
  return {
    event_roles: eventRoles,
    org_ids: orgIds,
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      is_platform_admin: row.is_platform_admin,
      created_at: row.created_at.toISOString(),
    },
    profile: {
      bio: row.bio,
      avatar_url: row.avatar_url,
      github_username: row.github_username,
      school: row.school,
      level_of_study: row.level_of_study,
      graduation_year: row.graduation_year,
      country: row.country,
      gender: row.gender,
      timezone: row.timezone,
      email_reminders: row.email_reminders,
    },
  };
}

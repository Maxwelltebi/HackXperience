import { isAutoSubmittable, submitProblems } from '@hx/core';
import {
  ApiError,
  githubRepoOf,
  type SaveSubmissionBody,
  type ShaState,
  type Submission,
  type SubmissionCounts,
  type SubmissionStatus,
} from '@hx/shared';
import { audit } from './audit';
import type { ISql, Sql } from './client';
import { lockEvent } from './events';
import { lockEventForDeadline } from './guards';
import { iso } from './rows';
import { broadcast, broadcastStaffCounts } from './live';
import { lockMyTeam } from './teams';
import { liveTopics } from '@hx/shared';

interface SubmissionRow {
  id: string;
  event_id: string;
  team_id: string;
  title: string;
  tagline: string;
  write_up: string;
  github_url: string | null;
  youtube_url: string | null;
  demo_url: string | null;
  status: SubmissionStatus;
  submitted_at: Date | null;
  auto_submitted: boolean;
  below_min_size: boolean;
  version: number;
  locked_commit_sha: string | null;
  sha_status: ShaState;
  sha_fetched_at: Date | null;
  updated_at: Date;
  deleted_at: Date | null;
}

const SUBMISSION_COLUMNS = [
  'id',
  'event_id',
  'team_id',
  'title',
  'tagline',
  'write_up',
  'github_url',
  'youtube_url',
  'demo_url',
  'status',
  'submitted_at',
  'auto_submitted',
  'below_min_size',
  'version',
  'locked_commit_sha',
  'sha_status',
  'sha_fetched_at',
  'updated_at',
  'deleted_at',
] as const;

// ---------- Reads ----------

/** The submission row for a team, with its tracks, or the blank draft every team starts from. */
async function readSubmission(
  sql: ISql,
  eventId: string,
  teamId: string,
  options: { forUpdate?: boolean } = {},
): Promise<{ row: SubmissionRow | null; submission: Submission }> {
  const [row] = await sql<[SubmissionRow?]>`
    select ${sql(SUBMISSION_COLUMNS)} from submissions
    where team_id = ${teamId}
    ${options.forUpdate ? sql`for update` : sql``}
  `;
  if (row?.deleted_at) {
    throw new ApiError('NOT_FOUND', "The organizers removed your team's submission.");
  }
  if (!row) return { row: null, submission: blankSubmission(eventId, teamId) };
  const tracks = await sql<{ track_id: string }[]>`
    select st.track_id from submission_tracks st
    join tracks t on t.id = st.track_id
    where st.submission_id = ${row.id}
    order by t.name, st.track_id
  `;
  return {
    row,
    submission: toSubmission(
      row,
      tracks.map((t) => t.track_id),
    ),
  };
}

function blankSubmission(eventId: string, teamId: string): Submission {
  return {
    id: null,
    event_id: eventId,
    team_id: teamId,
    title: '',
    tagline: '',
    write_up: '',
    github_url: null,
    youtube_url: null,
    demo_url: null,
    track_ids: [],
    status: 'draft',
    submitted_at: null,
    auto_submitted: false,
    below_min_size: false,
    version: 0,
    locked_commit_sha: null,
    sha_status: 'none',
    sha_fetched_at: null,
    updated_at: null,
  };
}

function toSubmission(row: SubmissionRow, trackIds: string[]): Submission {
  return {
    id: row.id,
    event_id: row.event_id,
    team_id: row.team_id,
    title: row.title,
    tagline: row.tagline,
    write_up: row.write_up,
    github_url: row.github_url,
    youtube_url: row.youtube_url,
    demo_url: row.demo_url,
    track_ids: trackIds,
    status: row.status,
    submitted_at: iso(row.submitted_at),
    auto_submitted: row.auto_submitted,
    below_min_size: row.below_min_size,
    version: row.version,
    locked_commit_sha: row.locked_commit_sha,
    sha_status: row.sha_status,
    sha_fetched_at: iso(row.sha_fetched_at),
    updated_at: iso(row.updated_at),
  };
}

/** GET /events/{id}/teams/me/submission: the caller's team's submission (members only). */
export async function getMySubmission(
  sql: ISql,
  eventId: string,
  userId: string,
): Promise<Submission> {
  const [membership] = await sql<[{ team_id: string }?]>`
    select m.team_id from team_members m
    join teams t on t.id = m.team_id and t.deleted_at is null
    where m.event_id = ${eventId} and m.user_id = ${userId}
  `;
  if (!membership) throw new ApiError('NOT_ON_TEAM', "You're not on a team at this event.");
  return (await readSubmission(sql, eventId, membership.team_id)).submission;
}

/** Draft and submitted counts for the organizer overview. */
export async function countSubmissions(sql: ISql, eventId: string): Promise<SubmissionCounts> {
  const [row] = await sql<[SubmissionCounts]>`
    select
      (select count(*)::int from teams where event_id = ${eventId} and deleted_at is null) as teams,
      count(*) filter (where s.status = 'draft')::int as drafts,
      count(*) filter (where s.status = 'submitted')::int as submitted
    from submissions s
    join teams t on t.id = s.team_id and t.deleted_at is null
    where s.event_id = ${eventId} and s.deleted_at is null
  `;
  return row;
}

// ---------- Writes (run inside tx()) ----------

/**
 * PUT /events/{id}/teams/me/submission. Lock order (Agent rules 7 and 8): event FOR SHARE with
 * the deadline check, then the team row, then the submission. `version` is the If-Match value:
 * a mismatch means a teammate saved first (STALE_VERSION, with their version in the details).
 * The first save (version 0) creates the row. Saving keeps the status, so a submitted
 * project stays submitted while it is edited.
 */
export async function saveSubmission(
  sql: ISql,
  eventId: string,
  userId: string,
  version: number,
  body: SaveSubmissionBody,
): Promise<Submission> {
  const event = await lockEventForDeadline(sql, eventId);
  const team = await lockMyTeam(sql, eventId, userId);
  const { row, submission: current } = await readSubmission(sql, eventId, team.id, {
    forUpdate: true,
  });

  if (version !== current.version) {
    throw new ApiError('STALE_VERSION', 'A teammate saved a newer version first.', {
      current,
    });
  }
  const trackIds = await checkTracks(sql, eventId, body.track_ids, event.max_tracks_per_submission);

  const fields = {
    title: body.title,
    tagline: body.tagline,
    write_up: body.write_up,
    github_url: body.github_url ?? null,
    youtube_url: body.youtube_url ?? null,
    demo_url: body.demo_url ?? null,
  };
  let submissionId: string;
  if (row) {
    await sql`
      update submissions
      set ${sql(fields)}, version = version + 1, updated_at = now()
      where id = ${row.id}
    `;
    submissionId = row.id;
  } else {
    const [created] = await sql<[{ id: string }]>`
      insert into submissions ${sql({ ...fields, event_id: eventId, team_id: team.id })}
      returning id
    `;
    submissionId = created.id;
  }

  await sql`delete from submission_tracks where submission_id = ${submissionId}`;
  if (trackIds.length > 0) {
    await sql`
      insert into submission_tracks (submission_id, track_id)
      select ${submissionId}, unnest(${trackIds}::uuid[])
    `;
  }
  const saved = (await readSubmission(sql, eventId, team.id)).submission;
  // Teammates with the editor open see "a teammate saved" (version = the submission version).
  await broadcast(sql, liveTopics.team(team.id), {
    type: 'submission.saved',
    version: saved.version,
    by: userId,
  });
  if (!row) await broadcastStaffCounts(sql, eventId);
  return saved;
}

/** Tracks must belong to the event, without repeats, and at most `max` of them. */
async function checkTracks(
  sql: ISql,
  eventId: string,
  requested: string[],
  max: number,
): Promise<string[]> {
  const trackIds = [...new Set(requested)];
  if (trackIds.length > max) {
    throw ApiError.validation('Too many tracks.', {
      track_ids: max === 1 ? 'Choose one track.' : `Choose up to ${max} tracks.`,
    });
  }
  if (trackIds.length === 0) return trackIds;
  const found = await sql<{ id: string }[]>`
    select id from tracks where event_id = ${eventId} and id = any(${trackIds}::uuid[])
  `;
  if (found.length !== trackIds.length) {
    throw ApiError.validation('Unknown track.', {
      track_ids: "One of those tracks isn't part of this event.",
    });
  }
  return trackIds;
}

/**
 * POST /events/{id}/teams/me/submission/submit. Needs a title, a write-up, and at least
 * team_size_min members. Pressing it again changes nothing. The version stays the same:
 * it counts content edits, so a teammate's open editor is not made stale.
 */
export async function submitSubmission(
  sql: ISql,
  eventId: string,
  userId: string,
): Promise<Submission> {
  const event = await lockEventForDeadline(sql, eventId);
  const team = await lockMyTeam(sql, eventId, userId);
  const { row, submission } = await readSubmission(sql, eventId, team.id, { forUpdate: true });

  const [{ members }] = await sql<[{ members: number }]>`
    select count(*)::int as members from team_members where team_id = ${team.id}
  `;
  const problems = submitProblems(submission, members, event.team_size_min);
  if (!row || Object.keys(problems.fields).length > 0) {
    throw ApiError.validation('Your project needs a title and a write-up.', problems.fields);
  }
  if (problems.tooSmall) {
    throw new ApiError(
      'TEAM_TOO_SMALL',
      `Teams need at least ${event.team_size_min} people to submit. Yours has ${members}.`,
      { team_size_min: event.team_size_min, members },
    );
  }
  if (row.status !== 'submitted') {
    await sql`
      update submissions set status = 'submitted', submitted_at = now(), updated_at = now()
      where id = ${row.id}
    `;
    await broadcast(sql, liveTopics.team(team.id), {
      type: 'submission.submitted',
      version: row.version,
      by: userId,
    });
    await broadcastStaffCounts(sql, eventId);
  }
  return (await readSubmission(sql, eventId, team.id)).submission;
}

/**
 * POST /events/{id}/submissions/reopen (owner only), after an outage (DESIGN Step 7): a new
 * deadline later than now, and saving works again until then. Takes the event row FOR UPDATE,
 * like the lock step, so it can't interleave with a lock in progress. Audited.
 */
export async function reopenSubmissions(
  sql: ISql,
  eventId: string,
  actorId: string,
  newDeadline: Date,
): Promise<{ submission_deadline: string; submissions_locked_at: string | null }> {
  const event = await lockEvent(sql, eventId);
  if (event.status !== 'published' && event.status !== 'live') {
    throw new ApiError(
      'INVALID_TRANSITION',
      'Submissions can only be reopened before judging starts.',
    );
  }
  const [{ now }] = await sql<[{ now: Date }]>`select now()`;
  const fields: Record<string, string> = {};
  if (newDeadline <= now) fields.submission_deadline = 'Pick a time in the future.';
  else if (newDeadline > event.ends_at) {
    fields.submission_deadline = 'Pick a time before the event ends, or change the end time first.';
  } else if (newDeadline <= event.starts_at) {
    fields.submission_deadline = 'Pick a time after the event starts.';
  }
  if (Object.keys(fields).length > 0) {
    throw ApiError.validation('Choose a new deadline.', fields);
  }

  const [row] = await sql<[{ submission_deadline: Date; submissions_locked_at: Date | null }]>`
    update events
    set submission_deadline = ${newDeadline}, submissions_locked_at = null
    where id = ${eventId}
    returning submission_deadline, submissions_locked_at
  `;
  await audit(sql, {
    eventId,
    actorId,
    action: 'submissions.reopened',
    entityType: 'event',
    entityId: eventId,
    before: {
      submission_deadline: event.submission_deadline.toISOString(),
      submissions_locked_at: iso(event.submissions_locked_at),
    },
    after: { submission_deadline: row.submission_deadline.toISOString() },
  });
  return {
    submission_deadline: row.submission_deadline.toISOString(),
    submissions_locked_at: iso(row.submissions_locked_at),
  };
}

// ---------- The deadline lock (tick step) ----------

export interface DeadlineLockResult {
  event_id: string;
  auto_submitted: number;
  below_min_size: number;
  pending_hashes: number;
}

/**
 * The lock transaction from DESIGN Step 6 part 1, for one event. Run it inside tx(). The
 * event row is taken FOR UPDATE, which waits for in-flight saves (they hold it FOR SHARE)
 * and blocks new ones; once it commits, every later save sees submissions_locked_at and gets
 * SUBMISSION_LOCKED. Returns null when the event is not due or was already locked, so running
 * it twice, or from two ticks at once, changes nothing the second time.
 */
export async function lockSubmissionDeadline(
  sql: ISql,
  eventId: string,
): Promise<DeadlineLockResult | null> {
  const [event] = await sql<[{ submission_deadline: Date; team_size_min: number }?]>`
    select submission_deadline, team_size_min from events
    where id = ${eventId} and deleted_at is null
      and submissions_locked_at is null and submission_deadline <= now()
    for update
  `;
  if (!event) return null;

  // Teams below the minimum are flagged for organizers (recomputed if the event was reopened).
  const small = await sql<{ id: string }[]>`
    update submissions s
    set below_min_size = (
      select count(*) from team_members m where m.team_id = s.team_id
    ) < ${event.team_size_min}
    where s.event_id = ${eventId} and s.deleted_at is null
    returning case when s.below_min_size then s.id end as id
  `;

  // Drafts with a title and a write-up become submissions, stamped at the deadline.
  const drafts = await sql<{ id: string; status: string; title: string; write_up: string }[]>`
    select id, status, title, write_up from submissions
    where event_id = ${eventId} and status = 'draft' and deleted_at is null
  `;
  const autoIds = drafts.filter(isAutoSubmittable).map((d) => d.id);
  if (autoIds.length > 0) {
    await sql`
      update submissions
      set status = 'submitted', submitted_at = ${event.submission_deadline},
          auto_submitted = true, updated_at = now()
      where id = any(${autoIds}::uuid[])
    `;
  }

  // Commit hashes are fetched after this commits (never inside it): mark which to fetch.
  const pending = await sql<{ id: string }[]>`
    update submissions
    set sha_status = case when github_url is null then 'none'::sha_state else 'pending'::sha_state end,
        locked_commit_sha = null, sha_fetched_at = null
    where event_id = ${eventId} and deleted_at is null
    returning case when github_url is not null then id end as id
  `;

  await sql`update events set submissions_locked_at = now() where id = ${eventId}`;
  const result: DeadlineLockResult = {
    event_id: eventId,
    auto_submitted: autoIds.length,
    below_min_size: small.filter((r) => r.id !== null).length,
    pending_hashes: pending.filter((r) => r.id !== null).length,
  };
  await audit(sql, {
    eventId,
    actorId: null,
    action: 'submissions.locked',
    entityType: 'event',
    entityId: eventId,
    after: {
      submission_deadline: event.submission_deadline.toISOString(),
      auto_submitted: result.auto_submitted,
      below_min_size: result.below_min_size,
      pending_hashes: result.pending_hashes,
    },
  });
  return result;
}

/** Runs the lock for every event whose deadline has passed and that isn't locked yet. */
export async function lockDueDeadlines(sql: ISql): Promise<DeadlineLockResult[]> {
  const due = await sql<{ id: string }[]>`
    select id from events
    where deleted_at is null and submissions_locked_at is null and submission_deadline <= now()
    order by submission_deadline
  `;
  const results: DeadlineLockResult[] = [];
  for (const { id } of due) {
    const result = await lockSubmissionDeadline(sql, id);
    if (result) results.push(result);
  }
  return results;
}

// ---------- Commit hashes (tick step, outside any transaction) ----------

/**
 * Fetches the latest commit on a repository's default branch. Implemented with the GitHub API
 * in the web app; faked in tests. Throw for errors worth retrying (network, rate limit).
 */
export type CommitFetcher = (repo: {
  owner: string;
  repo: string;
}) => Promise<{ kind: 'captured'; sha: string } | { kind: 'unreachable' }>;

export interface HashResult {
  captured: number;
  unreachable: number;
  retrying: number;
}

/** How many pending hashes one tick fetches. */
export const HASH_BATCH = 50;

/**
 * Captures commit hashes for submissions marked pending by the lock (build plan Phase 4
 * item 6). Every network call happens outside a transaction (Agent rule 9). A 404 becomes
 * unreachable; a thrown error leaves the row pending for the next tick. Each update checks
 * the row is still pending, so two ticks overlapping is harmless.
 */
export async function capturePendingHashes(
  sql: Sql,
  fetchCommit: CommitFetcher,
  options: { limit?: number; eventIds?: string[] } = {},
): Promise<HashResult> {
  const rows = await sql<{ id: string; github_url: string | null }[]>`
    select id, github_url from submissions
    where sha_status = 'pending' and deleted_at is null
      ${options.eventIds ? sql`and event_id = any(${options.eventIds}::uuid[])` : sql``}
    order by id
    limit ${options.limit ?? HASH_BATCH}
  `;
  const result: HashResult = { captured: 0, unreachable: 0, retrying: 0 };
  for (const row of rows) {
    const repo = row.github_url ? githubRepoOf(row.github_url) : null;
    let outcome: Awaited<ReturnType<CommitFetcher>>;
    try {
      outcome = repo ? await fetchCommit(repo) : { kind: 'unreachable' };
    } catch {
      result.retrying += 1;
      continue;
    }
    if (outcome.kind === 'captured') {
      await sql`
        update submissions
        set sha_status = 'captured', locked_commit_sha = ${outcome.sha}, sha_fetched_at = now()
        where id = ${row.id} and sha_status = 'pending'
      `;
      result.captured += 1;
    } else {
      await sql`
        update submissions set sha_status = 'unreachable', sha_fetched_at = now()
        where id = ${row.id} and sha_status = 'pending'
      `;
      result.unreachable += 1;
    }
  }
  return result;
}

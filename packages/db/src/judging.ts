import { randomUUID } from 'node:crypto';
import { assignJudges, computeStandings, type StandingRow as CoreRow } from '@hx/core';
import {
  ApiError,
  resultsSnapshotSchema,
  type AssignJudgesResult,
  type AwardResult,
  type Feedback,
  type GalleryItem,
  type GalleryPage,
  type JudgeQueue,
  type JudgingSubmission,
  type PutScoresBody,
  type Results,
  type ResultsSnapshot,
  type RubricCriterion,
  type Standings,
  type StandingRow,
} from '@hx/shared';
import { audit } from './audit';
import type { ISql } from './client';
import { lockEvent } from './events';
import { broadcast, broadcastStaffCounts, liveVersion } from './live';
import { liveTopics } from '@hx/shared';
import { projectImagesJson } from './project-images';

// ---------- Shared reads ----------

async function eventStatus(sql: ISql, eventId: string, lock: 'share' | null = null) {
  const [row] = await sql<[{ status: string; results_snapshot: unknown }?]>`
    select status, results_snapshot from events
    where id = ${eventId} and deleted_at is null
    ${lock === 'share' ? sql`for share` : sql``}
  `;
  if (!row) throw new ApiError('NOT_FOUND', 'No such event.');
  return row;
}

async function loadCriteria(sql: ISql, eventId: string): Promise<RubricCriterion[]> {
  const rows = await sql<
    {
      id: string;
      name: string;
      description: string;
      max_score: number;
      weight: string;
      position: number;
      is_tiebreaker: boolean;
    }[]
  >`
    select id, name, description, max_score, weight, position, is_tiebreaker
    from rubric_criteria where event_id = ${eventId}
    order by position, name, id
  `;
  return rows.map((r) => ({ ...r, weight: Number(r.weight) }));
}

/** Submitted, not deleted: the projects that are judged (empty drafts are not: Q7). */
async function judgedSubmissions(sql: ISql, eventId: string) {
  return sql<
    {
      id: string;
      team_id: string;
      team_name: string;
      title: string;
      tagline: string;
      below_min_size: boolean;
      track_ids: string[];
    }[]
  >`
    select s.id, s.team_id, t.name as team_name, s.title, s.tagline, s.below_min_size,
           coalesce(array_agg(st.track_id) filter (where st.track_id is not null), '{}') as track_ids
    from submissions s
    join teams t on t.id = s.team_id and t.deleted_at is null
    left join submission_tracks st on st.submission_id = s.id
    where s.event_id = ${eventId} and s.status = 'submitted' and s.deleted_at is null
    group by s.id, t.name
    order by s.id
  `;
}

// ---------- Assignment ----------

/**
 * POST /events/{id}/judging/assign (owner, admin; only while judging). Assignments that already
 * have scores are kept; the rest are recomputed and every submission is topped up to N judges,
 * balanced, with judges never assigned to a team they are on. Audited with the seed.
 */
export async function assignJudgesForEvent(
  sql: ISql,
  eventId: string,
  actorId: string,
  perSubmission: number,
  seed: string = randomUUID(),
): Promise<AssignJudgesResult> {
  const event = await lockEvent(sql, eventId);
  if (event.status !== 'judging') {
    throw new ApiError('INVALID_TRANSITION', 'Start judging before assigning judges.');
  }
  const judges = await sql<{ user_id: string }[]>`
    select user_id from event_staff where event_id = ${eventId} and role = 'judge'
  `;
  const submissions = await judgedSubmissions(sql, eventId);
  const conflicts = await sql<{ judge_id: string; submission_id: string }[]>`
    select st.user_id as judge_id, s.id as submission_id
    from event_staff st
    join team_members m on m.event_id = st.event_id and m.user_id = st.user_id
    join submissions s on s.team_id = m.team_id
    where st.event_id = ${eventId} and st.role = 'judge'
  `;
  const fixed = await sql<{ judge_id: string; submission_id: string }[]>`
    select distinct a.judge_id, a.submission_id from judge_assignments a
    join scores sc on sc.submission_id = a.submission_id and sc.judge_id = a.judge_id
    where a.event_id = ${eventId}
  `;

  const result = assignJudges({
    submissionIds: submissions.map((s) => s.id),
    judgeIds: judges.map((j) => j.user_id),
    perSubmission,
    conflicts,
    fixed,
    seed,
  });

  await sql`
    delete from judge_assignments a
    where a.event_id = ${eventId}
      and not exists (select 1 from scores sc
                      where sc.submission_id = a.submission_id and sc.judge_id = a.judge_id)
  `;
  if (result.assignments.length > 0) {
    await sql`
      insert into judge_assignments (event_id, judge_id, submission_id)
      select ${eventId}, x.judge_id, x.submission_id
      from unnest(${result.assignments.map((a) => a.judge_id)}::uuid[],
                  ${result.assignments.map((a) => a.submission_id)}::uuid[]) as x(judge_id, submission_id)
      on conflict do nothing
    `;
  }
  const version = await liveVersion(sql);
  for (const judgeId of new Set(result.assignments.map((a) => a.judge_id))) {
    await broadcast(sql, liveTopics.user(judgeId), { type: 'judging.assigned', version });
  }
  await broadcastStaffCounts(sql, eventId);
  const summary: AssignJudgesResult = {
    seed,
    judges: judges.length,
    submissions: submissions.length,
    assignments: result.assignments.length,
    short: result.short,
  };
  await audit(sql, {
    eventId,
    actorId,
    action: 'judging.assigned',
    entityType: 'event',
    entityId: eventId,
    after: { ...summary, per_submission: perSubmission },
  });
  return summary;
}

// ---------- A judge's queue and scoring ----------

/** GET /events/{id}/judging/me: the caller's assigned submissions. */
export async function getJudgeQueue(
  sql: ISql,
  eventId: string,
  judgeId: string,
): Promise<JudgeQueue> {
  const { status } = await eventStatus(sql, eventId);
  const [{ criteria }] = await sql<[{ criteria: number }]>`
    select count(*)::int as criteria from rubric_criteria where event_id = ${eventId}
  `;
  const items = await sql<
    {
      submission_id: string;
      title: string;
      tagline: string;
      team_name: string;
      track_ids: string[];
      scored: number;
    }[]
  >`
    select s.id as submission_id, s.title, s.tagline, t.name as team_name,
           coalesce((select array_agg(track_id order by track_id) from submission_tracks
                     where submission_id = s.id), '{}') as track_ids,
           (select count(*)::int from scores sc
            where sc.submission_id = s.id and sc.judge_id = ${judgeId}) as scored
    from judge_assignments a
    join submissions s on s.id = a.submission_id and s.deleted_at is null
    join teams t on t.id = s.team_id and t.deleted_at is null
    where a.event_id = ${eventId} and a.judge_id = ${judgeId}
    order by lower(s.title), s.id
  `;
  const mapped = items.map(({ scored, ...item }) => ({
    ...item,
    scored: criteria > 0 && scored >= criteria,
  }));
  return {
    items: mapped,
    scored: mapped.filter((i) => i.scored).length,
    total: mapped.length,
    judging_open: status === 'judging',
  };
}

async function isAssigned(sql: ISql, submissionId: string, judgeId: string): Promise<boolean> {
  const rows = await sql`
    select 1 from judge_assignments where submission_id = ${submissionId} and judge_id = ${judgeId}
  `;
  return rows.length > 0;
}

/**
 * GET /events/{id}/submissions/{sid}: an assigned judge, or an owner or admin (`readAll`).
 * Anyone else gets NOT_FOUND, so unassigned submissions don't reveal that they exist.
 */
export async function getSubmissionForJudging(
  sql: ISql,
  eventId: string,
  submissionId: string,
  viewer: { userId: string; readAll: boolean },
): Promise<JudgingSubmission> {
  if (!viewer.readAll && !(await isAssigned(sql, submissionId, viewer.userId))) {
    throw new ApiError('NOT_FOUND', 'No such submission in your judging queue.');
  }
  const [row] = await sql<
    [
      (Omit<JudgingSubmission, 'criteria' | 'my_scores' | 'judging_open' | 'track_ids'> & {
        track_ids: string[];
      })?,
    ]
  >`
    select s.id, s.event_id, s.team_id, t.name as team_name, s.title, s.tagline, s.write_up,
           s.github_url, s.youtube_url, s.demo_url, s.status, s.auto_submitted, s.below_min_size,
           s.locked_commit_sha, s.sha_status,
           coalesce((select array_agg(track_id order by track_id) from submission_tracks
                     where submission_id = s.id), '{}') as track_ids,
           ${projectImagesJson(sql)} as images
    from submissions s
    join teams t on t.id = s.team_id and t.deleted_at is null
    where s.id = ${submissionId} and s.event_id = ${eventId} and s.deleted_at is null
  `;
  if (!row) throw new ApiError('NOT_FOUND', 'No such submission.');
  const [{ status }, criteria, mine] = await Promise.all([
    eventStatus(sql, eventId),
    loadCriteria(sql, eventId),
    sql<{ criterion_id: string; score: string; comment: string | null }[]>`
      select criterion_id, score, comment from scores
      where submission_id = ${submissionId} and judge_id = ${viewer.userId}
    `,
  ]);
  return {
    ...row,
    criteria,
    my_scores: mine.map((s) => ({ ...s, score: Number(s.score) })),
    judging_open: status === 'judging',
  };
}

/**
 * PUT /events/{id}/submissions/{sid}/scores/me: an assigned judge, every criterion in one
 * request, each from 0 to its max_score, only while the event is judging. The event row is taken
 * FOR SHARE first, so a score can't slip in while results are being published. Audited.
 */
export async function putMyScores(
  sql: ISql,
  eventId: string,
  submissionId: string,
  judgeId: string,
  body: PutScoresBody,
): Promise<JudgingSubmission> {
  const { status } = await eventStatus(sql, eventId, 'share');
  if (status !== 'judging') {
    throw new ApiError('JUDGING_CLOSED', 'Scores can only be entered while the event is judging.');
  }
  if (!(await isAssigned(sql, submissionId, judgeId))) {
    throw new ApiError('NOT_FOUND', 'No such submission in your judging queue.');
  }
  const criteria = await loadCriteria(sql, eventId);
  const fields: Record<string, string> = {};
  const given = new Map(body.scores.map((s, i) => [s.criterion_id, { ...s, index: i }]));
  if (given.size !== body.scores.length) fields.scores = 'Each criterion once.';
  for (const c of criteria) {
    const s = given.get(c.id);
    if (!s) fields.scores = 'Score every criterion.';
    else if (s.score > c.max_score) fields[`scores.${s.index}.score`] = `At most ${c.max_score}.`;
  }
  if (body.scores.some((s) => !criteria.some((c) => c.id === s.criterion_id))) {
    fields.scores = "One of those criteria isn't in this event's rubric.";
  }
  if (Object.keys(fields).length > 0) throw ApiError.validation('Check the scores.', fields);

  const before = await sql<{ criterion_id: string; score: string; comment: string | null }[]>`
    select criterion_id, score, comment from scores
    where submission_id = ${submissionId} and judge_id = ${judgeId}
    for update
  `;
  const values = body.scores.map((s) => ({ ...s, score: Math.round(s.score * 100) / 100 }));
  await sql`
    insert into scores (submission_id, judge_id, criterion_id, score, comment)
    select ${submissionId}, ${judgeId}, x.criterion_id, x.score, x.comment
    from unnest(${values.map((v) => v.criterion_id)}::uuid[], ${values.map((v) => v.score)}::numeric[],
                ${values.map((v) => v.comment)}::text[]) as x(criterion_id, score, comment)
    on conflict (submission_id, judge_id, criterion_id)
    do update set score = excluded.score, comment = excluded.comment, updated_at = now()
  `;
  await broadcastStaffCounts(sql, eventId);
  await audit(sql, {
    eventId,
    actorId: judgeId,
    action: 'scores.saved',
    entityType: 'submission',
    entityId: submissionId,
    before: before.length > 0 ? before.map((b) => ({ ...b, score: Number(b.score) })) : null,
    after: values.map(({ criterion_id, score, comment }) => ({ criterion_id, score, comment })),
  });
  return getSubmissionForJudging(sql, eventId, submissionId, { userId: judgeId, readAll: false });
}

// ---------- Standings ----------

/** GET /events/{id}/judging/standings: computed on request (DESIGN Step 6 part 3). */
export async function getStandings(sql: ISql, eventId: string): Promise<Standings> {
  const [criteria, submissions, scores, assignments, tracks, judgeNames] = await Promise.all([
    loadCriteria(sql, eventId),
    judgedSubmissions(sql, eventId),
    sql<{ submission_id: string; judge_id: string; criterion_id: string; score: string }[]>`
      select sc.submission_id, sc.judge_id, sc.criterion_id, sc.score
      from scores sc
      join submissions s on s.id = sc.submission_id
      join teams t on t.id = s.team_id and t.deleted_at is null
      where s.event_id = ${eventId} and s.status = 'submitted' and s.deleted_at is null
    `,
    sql<{ judge_id: string; submission_id: string }[]>`
      select a.judge_id, a.submission_id from judge_assignments a
      join submissions s on s.id = a.submission_id
      join teams t on t.id = s.team_id and t.deleted_at is null
      where a.event_id = ${eventId} and s.status = 'submitted' and s.deleted_at is null
    `,
    sql<{ id: string; name: string }[]>`select id, name from tracks where event_id = ${eventId}`,
    sql<{ id: string; name: string }[]>`
      select u.id, u.name from users u
      where u.id in (select user_id from event_staff where event_id = ${eventId} and role = 'judge'
                     union select judge_id from judge_assignments where event_id = ${eventId})
    `,
  ]);
  const computed = computeStandings({
    criteria,
    submissions,
    scores: scores.map((s) => ({ ...s, score: Number(s.score) })),
    assignments,
  });
  const bySubmission = new Map(submissions.map((s) => [s.id, s]));
  const row = (r: CoreRow): StandingRow => {
    const s = bySubmission.get(r.submission_id);
    return {
      ...r,
      team_id: s?.team_id ?? '',
      team_name: s?.team_name ?? '',
      title: s?.title ?? '',
      track_ids: s?.track_ids ?? [],
      below_min_size: s?.below_min_size ?? false,
    };
  };
  const trackName = new Map(tracks.map((t) => [t.id, t.name]));
  const judgeName = new Map(judgeNames.map((j) => [j.id, j.name]));
  return {
    overall: computed.overall.map(row),
    tracks: computed.tracks
      .filter((t) => trackName.has(t.track_id))
      .map((t) => ({
        track_id: t.track_id,
        track_name: trackName.get(t.track_id) ?? '',
        rows: t.rows.map(row),
      })),
    judges: computed.judges.map((j) => ({ ...j, name: judgeName.get(j.judge_id) ?? 'Judge' })),
    progress: computed.progress,
    tiebreaker: criteria.find((c) => c.is_tiebreaker)?.name ?? null,
  };
}

// ---------- Awards ----------

/** Every award with its winners, their projects and members. */
export async function listAwardResults(sql: ISql, eventId: string): Promise<AwardResult[]> {
  const awards = await sql<
    {
      award_id: string;
      name: string;
      track_id: string | null;
      track_name: string | null;
      rank: number | null;
    }[]
  >`
    select a.id as award_id, a.name, a.track_id, t.name as track_name, a.rank
    from awards a left join tracks t on t.id = a.track_id
    where a.event_id = ${eventId}
    order by a.track_id nulls first, a.rank nulls last, a.name, a.id
  `;
  const winners = await sql<
    {
      award_id: string;
      team_id: string;
      team_name: string;
      submission_id: string | null;
      title: string | null;
      tagline: string | null;
      members: { user_id: string; name: string }[];
    }[]
  >`
    select w.award_id, w.team_id, t.name as team_name, s.id as submission_id, s.title, s.tagline,
           coalesce((select json_agg(json_build_object('user_id', u.id, 'name', u.name)
                                     order by m.joined_at, u.id)
                     from team_members m join users u on u.id = m.user_id
                     where m.team_id = t.id), '[]') as members
    from award_winners w
    join awards a on a.id = w.award_id and a.event_id = ${eventId}
    join teams t on t.id = w.team_id
    left join submissions s on s.team_id = t.id and s.deleted_at is null
    order by t.name, t.id
  `;
  return awards.map((a) => ({
    ...a,
    winners: winners
      .filter((w) => w.award_id === a.award_id)
      .map(({ award_id: _award, title, tagline, ...w }) => ({
        ...w,
        title: title ?? '',
        tagline: tagline ?? '',
      })),
  }));
}

/**
 * POST /events/{id}/awards/{aid}/winners (owner, admin): replaces the award's winners. Only while
 * judging: before that there is nothing to award, after it results are frozen. Each team needs a
 * submitted project, in the award's track for a track award. Audited.
 */
export async function setAwardWinners(
  sql: ISql,
  eventId: string,
  awardId: string,
  actorId: string,
  teamIds: string[],
): Promise<AwardResult[]> {
  const event = await lockEvent(sql, eventId);
  if (event.status === 'completed') {
    throw new ApiError('RESULTS_PUBLISHED', 'Results are published, so awards are final.');
  }
  if (event.status !== 'judging') {
    throw new ApiError('INVALID_TRANSITION', 'Choose winners once judging has started.');
  }
  const [award] = await sql<[{ track_id: string | null }?]>`
    select track_id from awards where id = ${awardId} and event_id = ${eventId}
  `;
  if (!award) throw new ApiError('NOT_FOUND', 'No such award.');
  const unique = [...new Set(teamIds)];
  if (unique.length > 0) {
    const eligible = await sql<{ team_id: string }[]>`
      select s.team_id from submissions s
      where s.event_id = ${eventId} and s.status = 'submitted' and s.deleted_at is null
        and s.team_id = any(${unique}::uuid[])
        ${
          award.track_id
            ? sql`and exists (select 1 from submission_tracks st
                              where st.submission_id = s.id and st.track_id = ${award.track_id})`
            : sql``
        }
    `;
    if (eligible.length !== unique.length) {
      throw ApiError.validation('Choose teams with a submitted project.', {
        team_ids: award.track_id
          ? 'Each winner needs a submitted project in this award’s track.'
          : 'Each winner needs a submitted project.',
      });
    }
  }
  const before = await sql<{ team_id: string }[]>`
    delete from award_winners where award_id = ${awardId} returning team_id
  `;
  if (unique.length > 0) {
    await sql`
      insert into award_winners (award_id, team_id)
      select ${awardId}, unnest(${unique}::uuid[])
    `;
  }
  await audit(sql, {
    eventId,
    actorId,
    action: 'award.winners_set',
    entityType: 'award',
    entityId: awardId,
    before: { team_ids: before.map((b) => b.team_id) },
    after: { team_ids: unique },
  });
  return listAwardResults(sql, eventId);
}

// ---------- Publishing results ----------

/**
 * The results snapshot saved when the event moves to completed, in the same transaction
 * (build plan Phase 5 item 5): awards with winners, and the standings at that moment.
 */
export async function buildResultsSnapshot(
  sql: ISql,
  eventId: string,
  publishedAt: Date,
): Promise<ResultsSnapshot> {
  const [awards, standings] = await Promise.all([
    listAwardResults(sql, eventId),
    getStandings(sql, eventId),
  ]);
  return {
    version: 1,
    event_id: eventId,
    published_at: publishedAt.toISOString(),
    awards,
    projects: standings.overall.length,
    standings,
  };
}

async function publishedSnapshot(sql: ISql, eventId: string): Promise<ResultsSnapshot> {
  const event = await eventStatus(sql, eventId);
  const parsed = resultsSnapshotSchema.safeParse(event.results_snapshot);
  if (event.status !== 'completed' || !parsed.success) {
    throw new ApiError('RESULTS_NOT_PUBLISHED', "Results aren't published yet.");
  }
  return parsed.data;
}

/** GET /events/{id}/results: anyone once completed, from the frozen snapshot. */
export async function getResults(sql: ISql, eventId: string): Promise<Results> {
  const {
    standings: _private,
    version: _version,
    ...results
  } = await publishedSnapshot(sql, eventId);
  return results;
}

/** The standings frozen at publication, for organizers. */
export async function getPublishedStandings(sql: ISql, eventId: string): Promise<Standings> {
  return (await publishedSnapshot(sql, eventId)).standings;
}

// ---------- Gallery ----------

function encodeCursor(title: string, id: string): string {
  return Buffer.from(JSON.stringify([title, id])).toString('base64url');
}

function decodeCursor(cursor: string): [string, string] {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (Array.isArray(value) && typeof value[0] === 'string' && typeof value[1] === 'string') {
      return [value[0], value[1]];
    }
  } catch {
    // fall through
  }
  throw ApiError.validation('Bad cursor.', { cursor: 'Use the next_cursor from the last page.' });
}

/**
 * GET /events/{id}/submissions: submitted projects, alphabetical by title, with cursor
 * pagination. Admins any time; everyone once completed (the caller checks which).
 */
export async function listGallery(
  sql: ISql,
  eventId: string,
  options: { cursor?: string | undefined; limit: number; submissionId?: string },
): Promise<GalleryPage> {
  const after = options.cursor ? decodeCursor(options.cursor) : null;
  const rows = await sql<(GalleryItem & { sort_title: string })[]>`
    select s.id as submission_id, s.team_id, t.name as team_name, s.title, s.tagline, s.write_up,
           s.github_url, s.youtube_url, s.demo_url, s.locked_commit_sha,
           lower(s.title) as sort_title,
           coalesce((select array_agg(track_id order by track_id) from submission_tracks
                     where submission_id = s.id), '{}') as track_ids,
           coalesce((select json_agg(json_build_object('user_id', u.id, 'name', u.name)
                                     order by m.joined_at, u.id)
                     from team_members m join users u on u.id = m.user_id
                     where m.team_id = t.id), '[]') as members,
           coalesce((select array_agg(a.name order by a.rank nulls last, a.name)
                     from award_winners w join awards a on a.id = w.award_id
                     where w.team_id = t.id and a.event_id = ${eventId}), '{}') as awards,
           ${projectImagesJson(sql)} as images
    from submissions s
    join teams t on t.id = s.team_id and t.deleted_at is null
    where s.event_id = ${eventId} and s.status = 'submitted' and s.deleted_at is null
      ${options.submissionId ? sql`and s.id = ${options.submissionId}` : sql``}
      ${after ? sql`and (lower(s.title), s.id) > (${after[0]}, ${after[1]}::uuid)` : sql``}
    order by lower(s.title), s.id
    limit ${options.limit + 1}
  `;
  const page = rows.slice(0, options.limit);
  const last = page.at(-1);
  return {
    items: page.map(({ sort_title: _sort, ...item }) => item),
    next_cursor:
      rows.length > options.limit && last
        ? encodeCursor(last.sort_title, last.submission_id)
        : null,
  };
}

// ---------- Team feedback ----------

/**
 * GET /events/{id}/teams/me/feedback: judges' comments on the caller's team's project, once
 * results are published. Judges are "Judge 1", "Judge 2", … in an order that doesn't reveal who
 * they are (a hash of judge and submission), never by name.
 */
export async function getTeamFeedback(
  sql: ISql,
  eventId: string,
  userId: string,
): Promise<Feedback> {
  await publishedSnapshot(sql, eventId);
  const [membership] = await sql<[{ team_id: string }?]>`
    select team_id from team_members where event_id = ${eventId} and user_id = ${userId}
  `;
  if (!membership) throw new ApiError('NOT_ON_TEAM', "You're not on a team at this event.");
  const rows = await sql<{ judge_order: string; criterion_name: string; comment: string }[]>`
    select md5(sc.judge_id::text || sc.submission_id::text) as judge_order,
           c.name as criterion_name, sc.comment
    from scores sc
    join submissions s on s.id = sc.submission_id and s.team_id = ${membership.team_id}
    join rubric_criteria c on c.id = sc.criterion_id
    where s.status = 'submitted' and s.deleted_at is null
      and sc.comment is not null and btrim(sc.comment) <> ''
    order by judge_order, c.position, c.name
  `;
  const order = [...new Set(rows.map((r) => r.judge_order))];
  return {
    items: rows.map((r) => ({
      judge: `Judge ${order.indexOf(r.judge_order) + 1}`,
      criterion_name: r.criterion_name,
      comment: r.comment,
    })),
  };
}

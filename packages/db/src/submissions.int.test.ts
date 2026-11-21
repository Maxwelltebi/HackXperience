// Submissions and the deadline lock (build plan Phase 4). The concurrency tests run real
// parallel transactions against Postgres, each on its own connection (Agent rule 20).
import { randomUUID } from 'node:crypto';
import { ApiError, saveSubmissionBodySchema, type Submission } from '@hx/shared';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeSql, getSql, tx, type ISql } from './client';
import { processOutbox } from './outbox';
import { enqueueDeadlineReminders } from './reminders';
import {
  capturePendingHashes,
  getMySubmission,
  lockSubmissionDeadline,
  reopenSubmissions,
  saveSubmission,
  submitSubmission,
  type CommitFetcher,
} from './submissions';
import { createTeam } from './teams';
import { confirmApplicant, testData } from './testing';

const sql = getSql();
const data = testData(sql);
// Enough connections for every request in a race to run at the same time.
const parallel = postgres(process.env.DATABASE_URL ?? '', {
  max: 56,
  prepare: false,
  onnotice: () => {},
});

afterAll(async () => {
  await data.cleanup();
  await parallel.end({ timeout: 5 });
  await closeSql();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function body(fields: Record<string, unknown> = {}) {
  return saveSubmissionBodySchema.parse(fields);
}

/** Runs `fn` and returns 'ok' or the ApiError code. */
async function outcome(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'ok';
  } catch (error) {
    if (error instanceof ApiError) return error.code;
    throw error;
  }
}

/** A published event owned by a fresh user. */
async function newEvent() {
  const owner = await data.user('Owner');
  const event = await data.event(owner.id);
  return { owner, eventId: event.id };
}

/** A team of `size` confirmed members; the first is the owner. */
async function newTeam(eventId: string, size = 1, name = 'Team') {
  const members = [];
  for (let i = 0; i < size; i++) {
    const user = await data.user(`${name} member ${i}`);
    await confirmApplicant(sql, eventId, user.id);
    members.push(user);
  }
  const [first, ...rest] = members;
  if (!first) throw new Error('size must be at least 1');
  const team = await tx((t) => createTeam(t, eventId, first.id, randomUUID(), name));
  for (const member of rest) {
    await sql`insert into team_members (team_id, event_id, user_id) values (${team.id}, ${eventId}, ${member.id})`;
  }
  return { teamId: team.id, members };
}

/** The `i`th member of a test team (fails the test if there is none). */
function member(team: { members: { id: string }[] }, i: number): { id: string } {
  const found = team.members[i];
  if (!found) throw new Error(`team has no member ${i}`);
  return found;
}

/** Moves the deadline to `seconds` from the database's now (negative: in the past). */
async function setDeadline(eventId: string, seconds: number) {
  await sql`
    update events
    set starts_at = now() - interval '1 day',
        submission_deadline = now() + make_interval(secs => ${seconds})
    where id = ${eventId}
  `;
}

const save = (db: ISql, eventId: string, userId: string, version: number, fields = {}) =>
  saveSubmission(db, eventId, userId, version, body(fields));

async function row(teamId: string) {
  const [r] = await sql<
    [
      {
        title: string;
        status: string;
        auto_submitted: boolean;
        below_min_size: boolean;
        submitted_at: Date | null;
        sha_status: string;
        locked_commit_sha: string | null;
        version: number;
      }?,
    ]
  >`
    select title, status::text, auto_submitted, below_min_size, submitted_at, sha_status::text,
           locked_commit_sha, version
    from submissions where team_id = ${teamId}
  `;
  return r;
}

describe('saving', () => {
  let eventId: string;
  let team: Awaited<ReturnType<typeof newTeam>>;

  beforeAll(async () => {
    ({ eventId } = await newEvent());
    team = await newTeam(eventId, 2);
  }, 60_000);

  it('starts from a blank draft at version 0, and each save adds 1', async () => {
    const [ama, efua] = [member(team, 0), member(team, 1)];
    const blank = await getMySubmission(sql, eventId, ama.id);
    expect(blank).toMatchObject({ id: null, version: 0, status: 'draft' });

    const first = await tx((t) => save(t, eventId, ama.id, 0, { title: 'ClinicQ' }));
    expect(first).toMatchObject({ version: 1, title: 'ClinicQ', status: 'draft' });
    const second = await tx((t) => save(t, eventId, efua.id, 1, { title: 'ClinicQ 2' }));
    expect(second.version).toBe(2);
    expect((await getMySubmission(sql, eventId, ama.id)).title).toBe('ClinicQ 2');
  });

  it("refuses an old version with STALE_VERSION and the teammate's version", async () => {
    const [ama] = [member(team, 0)];
    try {
      await tx((t) => save(t, eventId, ama.id, 1, { title: 'Old' }));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.code).toBe('STALE_VERSION');
      expect((apiError.details?.current as Submission).title).toBe('ClinicQ 2');
    }
  });

  it('two teammates saving with the same version: exactly one gets 409, in 10 rounds', async () => {
    const [ama, efua] = [member(team, 0), member(team, 1)];
    for (let round = 0; round < 10; round++) {
      const { version } = await getMySubmission(sql, eventId, ama.id);
      const results = await Promise.all(
        [ama, efua].map((u) =>
          outcome(() => parallel.begin((t) => save(t, eventId, u.id, version, { title: u.id }))),
        ),
      );
      expect(results.sort()).toEqual(['STALE_VERSION', 'ok']);
      expect((await getMySubmission(sql, eventId, ama.id)).version).toBe(version + 1);
    }
  }, 60_000);

  it('limits tracks to the event and to max_tracks_per_submission', async () => {
    const [ama] = [member(team, 0)];
    const tracks = await sql<{ id: string }[]>`
      insert into tracks (event_id, name) values (${eventId}, 'Health'), (${eventId}, 'Fintech')
      returning id
    `;
    const ids = tracks.map((t) => t.id);
    const { version } = await getMySubmission(sql, eventId, ama.id);
    expect(
      await outcome(() => tx((t) => save(t, eventId, ama.id, version, { track_ids: ids }))),
    ).toBe('VALIDATION_FAILED');
    expect(
      await outcome(() =>
        tx((t) => save(t, eventId, ama.id, version, { track_ids: [randomUUID()] })),
      ),
    ).toBe('VALIDATION_FAILED');
    const saved = await tx((t) => save(t, eventId, ama.id, version, { track_ids: [ids[0]] }));
    expect(saved.track_ids).toEqual([ids[0]]);
  });

  it('refuses someone who is not on a team', async () => {
    const loner = await data.user('Loner');
    await confirmApplicant(sql, eventId, loner.id);
    expect(await outcome(() => tx((t) => save(t, eventId, loner.id, 0)))).toBe('NOT_ON_TEAM');
  });
});

describe('submit', () => {
  it('needs a title, a write-up and team_size_min members; editing keeps it submitted', async () => {
    const { eventId } = await newEvent();
    await sql`update events set team_size_min = 2 where id = ${eventId}`;
    const team = await newTeam(eventId, 1);
    const [ama] = [member(team, 0)];

    expect(await outcome(() => tx((t) => submitSubmission(t, eventId, ama.id)))).toBe(
      'VALIDATION_FAILED',
    );
    await tx((t) => save(t, eventId, ama.id, 0, { title: 'ClinicQ', write_up: 'Queues.' }));
    expect(await outcome(() => tx((t) => submitSubmission(t, eventId, ama.id)))).toBe(
      'TEAM_TOO_SMALL',
    );

    const efua = await data.user('Efua');
    await confirmApplicant(sql, eventId, efua.id);
    await sql`insert into team_members (team_id, event_id, user_id) values (${team.teamId}, ${eventId}, ${efua.id})`;
    const submitted = await tx((t) => submitSubmission(t, eventId, efua.id));
    expect(submitted).toMatchObject({ status: 'submitted', auto_submitted: false, version: 1 });
    expect(submitted.submitted_at).not.toBeNull();

    const edited = await tx((t) =>
      save(t, eventId, ama.id, 1, { title: 'ClinicQ', write_up: 'v2' }),
    );
    expect(edited).toMatchObject({ status: 'submitted', version: 2, write_up: 'v2' });
    expect((await tx((t) => submitSubmission(t, eventId, ama.id))).submitted_at).toBe(
      submitted.submitted_at,
    );
  }, 60_000);
});

describe('the deadline lock', () => {
  it('50 saves timed around the deadline while the lock runs: each is locked in or got 423', async () => {
    const { eventId } = await newEvent();
    const teams = [];
    for (let i = 0; i < 50; i++) teams.push(await newTeam(eventId, 1, `Racer ${i}`));
    // Open every connection first, so the race measures the lock and not connection setup.
    await Promise.all(Array.from({ length: 56 }, () => parallel`select 1`));

    await setDeadline(eventId, 1.2);
    const lockRun = (async () => {
      for (let attempt = 0; attempt < 400; attempt++) {
        const locked = await parallel.begin((t) => lockSubmissionDeadline(t, eventId));
        if (locked) return locked;
        await sleep(20);
      }
      throw new Error('the lock never ran');
    })();
    const saves = teams.map(async (team, i) => {
      await sleep(i * 40); // 0 to 1.96 s: about 30 before the deadline, 20 after
      const userId = team.members[0]?.id ?? '';
      return outcome(() =>
        parallel.begin((t) =>
          save(t, eventId, userId, 0, { title: `Save ${i}`, write_up: `Write-up ${i}` }),
        ),
      );
    });
    const [results, locked] = await Promise.all([Promise.all(saves), lockRun]);

    expect(results.every((r) => r === 'ok' || r === 'SUBMISSION_LOCKED')).toBe(true);
    expect(results.filter((r) => r === 'ok').length).toBeGreaterThan(0);
    expect(results.filter((r) => r === 'SUBMISSION_LOCKED').length).toBeGreaterThan(0);
    for (const [i, team] of teams.entries()) {
      const saved = await row(team.teamId);
      if (results[i] === 'ok') {
        // In the locked data: the lock saw it and auto-submitted it.
        expect(saved).toMatchObject({
          title: `Save ${i}`,
          status: 'submitted',
          auto_submitted: true,
        });
      } else {
        expect(saved).toBeUndefined();
      }
    }
    expect(locked.auto_submitted).toBe(results.filter((r) => r === 'ok').length);
  }, 300_000);

  it('run twice, or by two ticks at once, changes nothing the second time', async () => {
    const { eventId } = await newEvent();
    const team = await newTeam(eventId, 1);
    const userId = team.members[0]?.id ?? '';
    await tx((t) => save(t, eventId, userId, 0, { title: 'A', write_up: 'B' }));
    await setDeadline(eventId, -1);

    const both = await Promise.all([
      parallel.begin((t) => lockSubmissionDeadline(t, eventId)),
      parallel.begin((t) => lockSubmissionDeadline(t, eventId)),
    ]);
    expect(both.filter((r) => r !== null)).toHaveLength(1);
    const [{ locked_at }] = await sql<[{ locked_at: Date }]>`
      select submissions_locked_at as locked_at from events where id = ${eventId}
    `;
    expect(await tx((t) => lockSubmissionDeadline(t, eventId))).toBeNull();
    const [again] = await sql<[{ locked_at: Date }]>`
      select submissions_locked_at as locked_at from events where id = ${eventId}
    `;
    expect(again.locked_at).toEqual(locked_at);
    const audits = await sql`
      select 1 from audit_log where event_id = ${eventId} and action = 'submissions.locked'
    `;
    expect(audits).toHaveLength(1);
  });

  it('a tick 10 minutes late still locks, and no save after the deadline was accepted', async () => {
    const { eventId } = await newEvent();
    const team = await newTeam(eventId, 1);
    const userId = team.members[0]?.id ?? '';
    await tx((t) => save(t, eventId, userId, 0, { title: 'Early', write_up: 'Before' }));
    await setDeadline(eventId, -600);

    // Not locked yet, but every write checks the clock itself.
    expect(await outcome(() => tx((t) => save(t, eventId, userId, 1, { title: 'Late' })))).toBe(
      'SUBMISSION_LOCKED',
    );
    expect(await outcome(() => tx((t) => submitSubmission(t, eventId, userId)))).toBe(
      'SUBMISSION_LOCKED',
    );

    const locked = await tx((t) => lockSubmissionDeadline(t, eventId));
    expect(locked?.auto_submitted).toBe(1);
    const [event] = await sql<[{ submission_deadline: Date }]>`
      select submission_deadline from events where id = ${eventId}
    `;
    expect(await row(team.teamId)).toMatchObject({
      title: 'Early',
      status: 'submitted',
      submitted_at: event.submission_deadline,
    });
  });

  it('auto-submits drafts with a title and write-up, skips empty ones, flags small teams', async () => {
    const { eventId } = await newEvent();
    await sql`update events set team_size_min = 2 where id = ${eventId}`;
    const complete = await newTeam(eventId, 2, 'Complete');
    const titleOnly = await newTeam(eventId, 2, 'Title only');
    const empty = await newTeam(eventId, 2, 'Empty');
    const small = await newTeam(eventId, 1, 'Small');
    const first = (t: { members: { id: string }[] }) => t.members[0]?.id ?? '';
    await tx((t) =>
      save(t, eventId, first(complete), 0, {
        title: 'Done',
        write_up: 'All here',
        github_url: 'https://github.com/ciren/done',
      }),
    );
    await tx((t) => save(t, eventId, first(titleOnly), 0, { title: 'Half' }));
    await tx((t) => save(t, eventId, first(empty), 0));
    await tx((t) => save(t, eventId, first(small), 0, { title: 'Solo', write_up: 'Alone' }));
    await setDeadline(eventId, -1);

    const result = await tx((t) => lockSubmissionDeadline(t, eventId));
    expect(result).toMatchObject({ auto_submitted: 2, below_min_size: 1, pending_hashes: 1 });
    expect(await row(complete.teamId)).toMatchObject({
      status: 'submitted',
      auto_submitted: true,
      sha_status: 'pending',
    });
    expect(await row(titleOnly.teamId)).toMatchObject({ status: 'draft', sha_status: 'none' });
    expect(await row(empty.teamId)).toMatchObject({ status: 'draft' });
    expect(await row(small.teamId)).toMatchObject({
      status: 'submitted',
      below_min_size: true,
    });
  }, 60_000);
});

describe('commit hashes', () => {
  it('captures, marks 404s unreachable, and retries network failures', async () => {
    const { eventId } = await newEvent();
    const repos = ['works', 'missing', 'flaky'];
    const teams = [];
    for (const repo of repos) {
      const team = await newTeam(eventId, 1, repo);
      await tx((t) =>
        save(t, eventId, team.members[0]?.id ?? '', 0, {
          title: repo,
          write_up: 'x',
          github_url: `https://github.com/ciren/${repo}`,
        }),
      );
      teams.push(team);
    }
    await setDeadline(eventId, -1);
    await tx((t) => lockSubmissionDeadline(t, eventId));

    const sha = 'a'.repeat(40);
    let flakyCalls = 0;
    const fetchCommit: CommitFetcher = ({ owner, repo }) => {
      expect(owner).toBe('ciren');
      if (repo === 'works') return Promise.resolve({ kind: 'captured', sha });
      if (repo === 'missing') return Promise.resolve({ kind: 'unreachable' });
      flakyCalls += 1;
      if (flakyCalls === 1) return Promise.reject(new Error('ECONNRESET'));
      return Promise.resolve({ kind: 'captured', sha: 'b'.repeat(40) });
    };

    const first = await capturePendingHashes(sql, fetchCommit, { eventIds: [eventId] });
    expect(first).toEqual({ captured: 1, unreachable: 1, retrying: 1 });
    const [works, missing, flaky] = teams.map((t) => t.teamId) as [string, string, string];
    expect(await row(works)).toMatchObject({ sha_status: 'captured', locked_commit_sha: sha });
    expect(await row(missing)).toMatchObject({
      sha_status: 'unreachable',
      locked_commit_sha: null,
    });
    expect(await row(flaky)).toMatchObject({ sha_status: 'pending' });

    const second = await capturePendingHashes(sql, fetchCommit, { eventIds: [eventId] });
    expect(second).toEqual({ captured: 1, unreachable: 0, retrying: 0 });
    expect(await row(flaky)).toMatchObject({
      sha_status: 'captured',
      locked_commit_sha: 'b'.repeat(40),
    });
  }, 60_000);
});

describe('reopen', () => {
  it('restores saving until the new deadline, and is audited', async () => {
    const { owner, eventId } = await newEvent();
    const team = await newTeam(eventId, 1);
    const userId = team.members[0]?.id ?? '';
    await setDeadline(eventId, -1);
    await tx((t) => lockSubmissionDeadline(t, eventId));
    expect(await outcome(() => tx((t) => save(t, eventId, userId, 0, { title: 'X' })))).toBe(
      'SUBMISSION_LOCKED',
    );

    expect(
      await outcome(() =>
        tx((t) => reopenSubmissions(t, eventId, owner.id, new Date(Date.now() - 60_000))),
      ),
    ).toBe('VALIDATION_FAILED');

    const newDeadline = new Date(Date.now() + 60 * 60_000);
    const result = await tx((t) => reopenSubmissions(t, eventId, owner.id, newDeadline));
    expect(result).toEqual({
      submission_deadline: newDeadline.toISOString(),
      submissions_locked_at: null,
    });
    const saved = await tx((t) => save(t, eventId, userId, 0, { title: 'After the outage' }));
    expect(saved.version).toBe(1);

    const [entry] = await sql<[{ actor_id: string; after: { submission_deadline: string } }]>`
      select actor_id, after from audit_log
      where event_id = ${eventId} and action = 'submissions.reopened'
    `;
    expect(entry.actor_id).toBe(owner.id);
    expect(entry.after.submission_deadline).toBe(newDeadline.toISOString());
  });

  it('is refused once judging has started', async () => {
    const { owner, eventId } = await newEvent();
    await setDeadline(eventId, -1);
    await sql`update events set status = 'judging' where id = ${eventId}`;
    expect(
      await outcome(() =>
        tx((t) => reopenSubmissions(t, eventId, owner.id, new Date(Date.now() + 3_600_000))),
      ),
    ).toBe('INVALID_TRANSITION');
  });
});

describe('deadline reminders', () => {
  it('queues one per member of each unsubmitted team, honours email_reminders, and dedupes', async () => {
    const { eventId } = await newEvent();
    const drafting = await newTeam(eventId, 2, 'Drafting');
    const done = await newTeam(eventId, 1, 'Done');
    const nothing = await newTeam(eventId, 1, 'Nothing yet');
    const [draftA, draftB] = [member(drafting, 0), member(drafting, 1)];
    const doneUser = done.members[0]?.id ?? '';
    const nothingUser = nothing.members[0]?.id ?? '';
    await sql`update profiles set email_reminders = false where user_id = ${draftB.id}`;
    await tx((t) => save(t, eventId, draftA.id, 0, { title: 'WIP' }));
    await tx((t) => save(t, eventId, doneUser, 0, { title: 'Done', write_up: 'Yes' }));
    await tx((t) => submitSubmission(t, eventId, doneUser));

    const keys = async () =>
      (
        await sql<{ dedupe_key: string }[]>`
          select dedupe_key from notification_outbox
          where payload->>'event_id' = ${eventId} order by dedupe_key
        `
      ).map((r) => r.dedupe_key);

    await setDeadline(eventId, 3 * 3600);
    await enqueueDeadlineReminders(sql);
    expect(await keys()).toEqual(
      [`reminder:${eventId}:${draftA.id}:24h`, `reminder:${eventId}:${nothingUser}:24h`].sort(),
    );
    await enqueueDeadlineReminders(sql);
    expect(await keys()).toHaveLength(2);

    await setDeadline(eventId, 30 * 60);
    await enqueueDeadlineReminders(sql);
    expect((await keys()).filter((k) => k.endsWith(':1h'))).toHaveLength(2);

    // Re-checked at send time: a team that submits in between gets no email.
    await tx((t) =>
      save(t, eventId, draftA.id, 1, { title: 'WIP', write_up: 'Finished just in time' }),
    );
    await tx((t) => submitSubmission(t, eventId, draftA.id));
    const sent: { to: string; subject: string }[] = [];
    const result = await processOutbox(
      sql,
      {
        appUrl: 'https://hack.example.test',
        sendEmail: (message) => {
          sent.push(message);
          return Promise.resolve({ messageId: `msg-${sent.length}` });
        },
      },
      { userIds: [draftA.id, nothingUser] },
    );
    expect(result).toMatchObject({ sent: 2, superseded: 2 });
    expect(sent.map((m) => m.subject).sort()).toEqual([
      '1 hour left to submit: Test Hackathon',
      '24 hours left to submit: Test Hackathon',
    ]);
  }, 60_000);
});

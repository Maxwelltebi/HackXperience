import { submissionsClosed } from '@hx/core';
import { ApiError, type EventStatus } from '@hx/shared';
import type { ISql } from './client';

export interface DeadlineEvent {
  id: string;
  status: EventStatus;
  submission_deadline: Date;
  submissions_locked_at: Date | null;
  team_size_min: number;
  team_size_max: number;
  max_tracks_per_submission: number;
  now: Date;
}

/**
 * The first statement of every deadline-sensitive write (Agent rule 7): a shared lock on the
 * event row, then the deadline check against the database clock. The tick's lock step takes
 * this row FOR UPDATE, so it waits for in-flight writes and blocks new ones. Run inside tx().
 */
export async function lockEventForDeadline(sql: ISql, eventId: string): Promise<DeadlineEvent> {
  const [event] = await sql<[DeadlineEvent?]>`
    select id, status, submission_deadline, submissions_locked_at,
           team_size_min, team_size_max, max_tracks_per_submission, now() as now
    from events
    where id = ${eventId} and deleted_at is null
    for share
  `;
  if (!event) throw new ApiError('NOT_FOUND', 'No such event.');
  if (submissionsClosed(event, event.now)) {
    throw new ApiError(
      'SUBMISSION_LOCKED',
      'The submission deadline has passed. Teams and submissions are final.',
      {
        submission_deadline: event.submission_deadline.toISOString(),
      },
    );
  }
  return event;
}

/** Teams and tickets are for people who confirmed their place (DESIGN Step 4 matrix). */
export async function requireConfirmed(sql: ISql, eventId: string, userId: string): Promise<void> {
  const [row] = await sql<[{ status: string }?]>`
    select status from applications where event_id = ${eventId} and user_id = ${userId}
  `;
  if (row?.status !== 'confirmed') {
    throw new ApiError('NOT_CONFIRMED', 'Confirm your place at this event first.');
  }
}

/**
 * Counts one attempt against a fixed-window limit in rate_limit_counters and throws
 * RATE_LIMITED past `limit`. Call it on the pool, NOT inside the transaction it protects:
 * a rolled-back attempt must still count, or failed guesses would be free.
 */
export async function hitRateLimit(
  sql: ISql,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const [row] = await sql<[{ count: number; retry_after: number }]>`
    insert into rate_limit_counters (key, window_start, count)
    values (
      ${key},
      to_timestamp(floor(extract(epoch from now()) / ${windowSeconds}) * ${windowSeconds}),
      1
    )
    on conflict (key, window_start) do update set count = rate_limit_counters.count + 1
    returning count,
      ceil(extract(epoch from window_start) + ${windowSeconds} - extract(epoch from now()))::int
        as retry_after
  `;
  if (row.count > limit) {
    throw new ApiError('RATE_LIMITED', 'Too many attempts. Wait a minute and try again.', {
      retry_after_seconds: Math.max(1, row.retry_after),
    });
  }
}

import type { ReminderKind } from '@hx/shared';

const HOUR_MS = 60 * 60 * 1000;

interface SubmissionText {
  title: string;
  write_up: string;
}

/** Whether a field holds something besides whitespace. */
function filled(value: string): boolean {
  return value.trim() !== '';
}

/**
 * Why Submit is refused, if it is (build plan Phase 4 item 4): a title and a write-up are
 * required, and the team needs at least `teamSizeMin` members. Empty when Submit may go ahead.
 */
export function submitProblems(
  submission: SubmissionText,
  memberCount: number,
  teamSizeMin: number,
): { fields: Record<string, string>; tooSmall: boolean } {
  const fields: Record<string, string> = {};
  if (!filled(submission.title)) fields.title = 'Add a title before you submit.';
  if (!filled(submission.write_up)) fields.write_up = 'Add a write-up before you submit.';
  return { fields, tooSmall: memberCount < teamSizeMin };
}

/**
 * Drafts the deadline lock turns into submissions (DESIGN Step 6 part 1): those with a title
 * and a write-up. Empty drafts stay drafts and are not judged (Q7 default).
 */
export function isAutoSubmittable(submission: SubmissionText & { status: string }): boolean {
  return submission.status === 'draft' && filled(submission.title) && filled(submission.write_up);
}

/**
 * Which deadline reminder is due at `now`, if any. The 24-hour reminder covers the window from
 * 24 hours to 1 hour before the deadline, and the 1-hour reminder the last hour, so a late
 * tick still sends the right one and never a "24 hours left" email with minutes to go.
 */
export function dueReminder(deadline: Date, now: Date): ReminderKind | null {
  const left = deadline.getTime() - now.getTime();
  if (left <= 0) return null;
  if (left <= HOUR_MS) return '1h';
  if (left <= 24 * HOUR_MS) return '24h';
  return null;
}

/**
 * The version in an If-Match header: `3`, `"3"` or `W/"3"`. Null when missing or not a
 * whole number, so the caller can refuse the save.
 */
export function parseIfMatch(header: string | null): number | null {
  if (header === null) return null;
  const match = /^\s*(?:W\/)?"?(\d{1,9})"?\s*$/.exec(header);
  return match?.[1] === undefined ? null : Number(match[1]);
}

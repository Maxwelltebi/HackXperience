/**
 * Whether deadline-sensitive writes (team join, leave, remove; submission save and submit)
 * are closed: the event was locked, or the database clock has reached the deadline
 * (Agent rule 7, DESIGN Step 6 part 1). `now` must be the database's now().
 */
export function submissionsClosed(
  event: { submission_deadline: Date; submissions_locked_at: Date | null },
  now: Date,
): boolean {
  return event.submissions_locked_at !== null || now >= event.submission_deadline;
}

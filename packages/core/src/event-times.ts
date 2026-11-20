import type { FieldErrors } from '@hx/shared';

export interface EventTimes {
  applications_open_at: string | null;
  applications_close_at: string | null;
  starts_at: string;
  submission_deadline: string;
  ends_at: string;
  team_size_min: number;
  team_size_max: number;
}

/**
 * Cross-field rules for an event's dates and team sizes, checked before saving so the
 * organizer gets field messages instead of a database constraint error.
 */
export function validateEventTimes(event: EventTimes): FieldErrors {
  const fields: FieldErrors = {};
  const at = (iso: string) => new Date(iso).getTime();

  if (at(event.starts_at) >= at(event.submission_deadline)) {
    fields.submission_deadline = 'The submission deadline must be after the start.';
  }
  if (at(event.submission_deadline) > at(event.ends_at)) {
    fields.ends_at = 'The event must end at or after the submission deadline.';
  }
  const { applications_open_at: open, applications_close_at: close } = event;
  if ((open === null) !== (close === null)) {
    fields[open === null ? 'applications_open_at' : 'applications_close_at'] =
      'Set both application dates, or neither.';
  } else if (open && close) {
    if (at(open) >= at(close))
      fields.applications_close_at = 'Applications must close after they open.';
    else if (at(close) > at(event.ends_at)) {
      fields.applications_close_at = 'Applications must close by the end of the event.';
    }
  }
  if (event.team_size_max < event.team_size_min) {
    fields.team_size_max = 'Must be at least the minimum team size.';
  }
  return fields;
}

/** "The CIReN Experience 5.0" → "the-ciren-experience-5-0". */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug.length >= 3 ? slug : `event-${slug || 'new'}`;
}

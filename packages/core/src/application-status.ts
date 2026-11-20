import type { ApplicationStatus, DecisionStatus, EventStatus } from '@hx/shared';

/** Statuses an organizer may still change. After the applicant's RSVP the decision is theirs. */
const DECIDABLE: readonly ApplicationStatus[] = ['submitted', 'accepted', 'waitlisted', 'rejected'];

export type StatusChange =
  | { kind: 'change'; to: ApplicationStatus }
  | { kind: 'unchanged' }
  | { kind: 'refused'; reason: string };

/**
 * An organizer's decision. Accept, waitlist and reject can replace each other freely until the
 * applicant RSVPs (the 10-minute email undo window depends on this).
 */
export function decideApplication(from: ApplicationStatus, to: DecisionStatus): StatusChange {
  if (from === to) return { kind: 'unchanged' };
  if (!DECIDABLE.includes(from)) {
    return { kind: 'refused', reason: `The applicant already ${from} their place.` };
  }
  return { kind: 'change', to };
}

/** The applicant's RSVP. Confirm from accepted; decline from accepted or confirmed. */
export function rsvpApplication(
  from: ApplicationStatus,
  response: 'confirm' | 'decline',
): StatusChange {
  if (response === 'confirm') {
    if (from === 'confirmed') return { kind: 'unchanged' };
    if (from === 'accepted') return { kind: 'change', to: 'confirmed' };
    return { kind: 'refused', reason: 'Only accepted applicants can confirm.' };
  }
  if (from === 'declined') return { kind: 'unchanged' };
  if (from === 'accepted' || from === 'confirmed') return { kind: 'change', to: 'declined' };
  return { kind: 'refused', reason: 'Only accepted or confirmed applicants can decline.' };
}

export interface ApplicationWindow {
  status: EventStatus;
  applications_open_at: string | null;
  applications_close_at: string | null;
  deleted_at: string | null;
}

/** Applications are open while the event is published or live and `now` is inside the window. */
export function applicationsOpen(event: ApplicationWindow, now: Date): boolean {
  if (event.deleted_at) return false;
  if (event.status !== 'published' && event.status !== 'live') return false;
  if (!event.applications_open_at || !event.applications_close_at) return false;
  return now >= new Date(event.applications_open_at) && now < new Date(event.applications_close_at);
}

import type { StaffRole } from './constants';

/**
 * The permission matrix from DESIGN Step 4 ("Who can do what"), staff side.
 * Every staff-only endpoint names one of these permissions; handler() refuses anyone
 * whose event roles don't include an allowed role. Participant rights (confirmed
 * participants create teams and submit) are checked against the application, not here.
 */
export const PERMISSIONS = {
  /** Edit event, change status, and set up tracks, schedule, rubric, awards. */
  'event.edit': ['owner', 'admin'],
  /** See the event while it is a draft, and its staff-only data. */
  'event.view_staff': ['owner', 'admin'],
  'staff.manage': ['owner'],
  'audit.read': ['owner'],
  'submissions.reopen': ['owner'],
  /** List, read and decide applications. Volunteers never see applications (DESIGN rule 3). */
  'applications.decide': ['owner', 'admin'],
  'checkins.manual': ['owner', 'admin'],
  'checkins.scan': ['owner', 'admin', 'volunteer'],
  'scores.write': ['judge'],
  'mentor.claim': ['mentor'],
} as const satisfies Record<string, readonly StaffRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(roles: readonly StaffRole[], permission: Permission): boolean {
  const allowed: readonly StaffRole[] = PERMISSIONS[permission];
  return roles.some((role) => allowed.includes(role));
}

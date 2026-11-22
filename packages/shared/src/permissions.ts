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
  /** Open or hide the event's project gallery before results are published (R40). */
  'gallery.publish': ['owner'],
  'audit.read': ['owner'],
  'submissions.reopen': ['owner'],
  /**
   * List, read and decide applications, at any status, confirmed and declined included (R34,
   * R35). Volunteers never see applications (DESIGN rule 3).
   */
  'applications.decide': ['owner', 'admin'],
  'checkins.manual': ['owner', 'admin'],
  /** Form teams for participants from their skill ratings (R36). */
  'teams.form': ['owner', 'admin'],
  'checkins.scan': ['owner', 'admin', 'volunteer'],
  /** Assign judges, read standings, choose award winners. */
  'judging.manage': ['owner', 'admin'],
  /** Read any submission, and the submission list before results are public. */
  'submissions.read_all': ['owner', 'admin'],
  'scores.write': ['judge'],
  'mentor.claim': ['mentor'],
  /** See the mentor queue (mentors work it; owners and admins watch it). */
  'mentor.view': ['owner', 'admin', 'mentor'],
  /** Post announcements. */
  'announcements.write': ['owner', 'admin'],
  /** The live staff dashboard. */
  'live.view': ['owner', 'admin'],
  /** Impact reports. */
  'reports.read': ['owner', 'admin'],
  /** Soft delete and restore events, teams and submissions (audited). */
  'records.delete': ['owner'],
} as const satisfies Record<string, readonly StaffRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(roles: readonly StaffRole[], permission: Permission): boolean {
  const allowed: readonly StaffRole[] = PERMISSIONS[permission];
  return roles.some((role) => allowed.includes(role));
}

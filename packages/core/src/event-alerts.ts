import { EVENT_ALERTS, type EventAlertKind } from '@hx/shared';

const HOUR = 3_600_000;

export interface EventAlertTimes {
  applicationsOpenAt: Date | null;
  applicationsCloseAt: Date | null;
  /** When each alert for this event was queued, if it has been. */
  sent: Partial<Record<EventAlertKind, Date>>;
}

/**
 * Which event alerts the tick should queue now (R42). "Published" is queued when the event is
 * published, never here.
 *
 * - Applications open: once the window has opened, with at least an hour left.
 * - Closing soon: in the last 48 hours, with at least an hour left, and not within 24 hours of
 *   another alert for the same event (a short window doesn't send three emails in a row).
 */
export function dueEventAlerts(event: EventAlertTimes, now: Date): EventAlertKind[] {
  const open = event.applicationsOpenAt;
  const close = event.applicationsCloseAt;
  if (!open || !close || now < open) return [];
  const left = close.getTime() - now.getTime();
  if (left < EVENT_ALERTS.minimumLeftHours * HOUR) return [];

  const due: EventAlertKind[] = [];
  if (!event.sent.applications_open) due.push('applications_open');

  const lastAlert = Math.max(
    ...Object.values(event.sent).map((at) => at.getTime()),
    // An "applications open" alert queued in this same run counts too.
    due.length > 0 ? now.getTime() : Number.NEGATIVE_INFINITY,
  );
  const quiet = now.getTime() - lastAlert >= EVENT_ALERTS.quietHours * HOUR;
  if (!event.sent.closing_soon && left <= EVENT_ALERTS.closingSoonHours * HOUR && quiet) {
    due.push('closing_soon');
  }
  return due;
}

import type { EventStatus } from '@hx/shared';
import { eventPhase } from '@/lib/ui/event-phase';
import { chipClass } from '@/lib/ui/status';

type Moment = Date | string;

interface CrumbEvent {
  name: string;
  status: EventStatus;
  applications_open_at: Moment | null;
  applications_close_at: Moment | null;
  ends_at: Moment;
}

const iso = (value: Moment) => (typeof value === 'string' ? value : value.toISOString());

/** The line above an organizer page title: the event's name and its status badge. */
export function EventCrumb({ event }: { event: CrumbEvent }) {
  const phase = eventPhase({
    status: event.status,
    applications_open_at: event.applications_open_at && iso(event.applications_open_at),
    applications_close_at: event.applications_close_at && iso(event.applications_close_at),
    ends_at: iso(event.ends_at),
  });
  return (
    <p className="crumb">
      {event.name} <span className={chipClass(phase.tone)}>{phase.label}</span>
    </p>
  );
}

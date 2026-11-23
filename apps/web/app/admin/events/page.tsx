import { getSql, listPlatformEvents } from '@hx/db';
import { formatDate } from '@hx/shared';
import type { Metadata } from 'next';
import Link from '@/components/link';
import { getViewer } from '@/lib/server/viewer';
import { chipClass, EVENT_STATUS } from '@/lib/ui/status';

export const metadata: Metadata = { title: 'Events · Platform admin' };

/**
 * Every event (R43), drafts and deleted ones included. Platform admins have owner rights at each,
 * so "Manage" opens the event's organizer tools whether or not they are on its staff.
 */
export default async function AdminEventsPage() {
  const viewer = await getViewer();
  const events = await listPlatformEvents(getSql());

  return (
    <div className="stack">
      <div className="row-between">
        <p className="muted" style={{ margin: 0 }}>
          {events.length === 0
            ? 'No events yet.'
            : `${events.length} ${events.length === 1 ? 'event' : 'events'}, running and upcoming first.`}{' '}
          You have owner rights at every event.
        </p>
        <Link className="btn btn-primary" href="/organize/new">
          New event
        </Link>
      </div>

      {events.length > 0 ? (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Status</th>
                <th>Starts</th>
                <th>Owners</th>
                <th>Applications</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const status = EVENT_STATUS[event.status];
                return (
                  <tr key={event.id}>
                    <td>
                      <strong>{event.name}</strong>
                      <span className="sub">/events/{event.slug}</span>
                    </td>
                    <td>
                      {event.deleted_at ? (
                        <span className="chip chip-danger">Deleted</span>
                      ) : (
                        <span className={chipClass(status.tone)}>{status.label}</span>
                      )}
                    </td>
                    <td className="mono">
                      {formatDate(event.starts_at, viewer?.timezone ?? event.timezone)}
                    </td>
                    <td>{event.owners.length > 0 ? event.owners.join(', ') : 'None'}</td>
                    <td className="mono">
                      {event.confirmed} <span className="muted">confirmed of</span>{' '}
                      {event.applications}
                    </td>
                    <td>
                      {event.deleted_at ? (
                        <Link href="/organize">Restore</Link>
                      ) : (
                        <span className="row" style={{ gap: 16 }}>
                          <Link href={`/organize/${event.id}`}>Manage</Link>
                          {event.status !== 'draft' ? (
                            <Link href={`/events/${event.slug}`}>View</Link>
                          ) : null}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

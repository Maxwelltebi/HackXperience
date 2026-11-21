import { getSql, listDeletedEvents, listStaffEvents } from '@hx/db';
import { formatDateTime } from '@hx/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RestoreEventButton } from '@/components/organize/event-delete';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { getViewer, headerProps } from '@/lib/server/viewer';
import { chipClass, EVENT_STATUS } from '@/lib/ui/status';

export const metadata: Metadata = { title: 'Organize' };
export const dynamic = 'force-dynamic';

const ROLE_LABEL = {
  owner: 'Owner',
  admin: 'Admin',
  judge: 'Judge',
  mentor: 'Mentor',
  volunteer: 'Volunteer',
};

export default async function OrganizePage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/sign-in?next=/organize');
  const [events, deleted] = await Promise.all([
    listStaffEvents(getSql(), viewer.userId),
    listDeletedEvents(getSql(), viewer.userId),
  ]);
  const canCreate = viewer.me.org_ids.length > 0;

  return (
    <>
      <SiteHeader {...headerProps(viewer)} />
      <main className="container page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Organize</p>
            <h1 className="h1">Your events</h1>
          </div>
          {canCreate ? (
            <Link className="btn btn-primary" href="/organize/new">
              New event
            </Link>
          ) : null}
        </div>

        {events.length === 0 ? (
          <div className="raised empty">
            <strong>No events yet</strong>
            <span>
              {canCreate
                ? 'Create a draft event; it stays private until you publish it.'
                : 'When an organizer adds you to their event as staff, it appears here.'}
            </span>
          </div>
        ) : (
          <div className="raised table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Starts</th>
                  <th>Status</th>
                  <th>Your role</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const status = EVENT_STATUS[event.status];
                  return (
                    <tr key={event.id}>
                      <td>
                        <Link href={`/organize/${event.id}`}>
                          <strong>{event.name}</strong>
                        </Link>
                      </td>
                      <td className="mono small">
                        {formatDateTime(event.starts_at.toISOString(), viewer.timezone)}
                      </td>
                      <td>
                        <span className={chipClass(status.tone)}>{status.label}</span>
                      </td>
                      <td>{event.roles.map((r) => ROLE_LABEL[r]).join(', ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {deleted.length > 0 ? (
          <section className="raised card stack-sm" aria-labelledby="deleted-title">
            <h2 id="deleted-title" className="h2" style={{ fontSize: 18 }}>
              Deleted events
            </h2>
            {deleted.map((e) => (
              <div key={e.id} className="row-between">
                <span>{e.name}</span>
                <RestoreEventButton eventId={e.id} />
              </div>
            ))}
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}

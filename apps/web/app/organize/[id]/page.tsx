import { countSubmissions, getSql, toEvent } from '@hx/db';
import { can, galleryOpen, listTimezones } from '@hx/shared';
import type { Metadata } from 'next';
import Link from '@/components/link';
import { DeleteEventButton } from '@/components/organize/event-delete';
import { EventForm } from '@/components/organize/event-form';
import { StatusCard } from '@/components/organize/status-card';
import { SubmissionsCard } from '@/components/organize/submissions-card';
import { loadOrganizerEvent } from '@/lib/server/organize';
import { EventCrumb } from '@/components/organize/event-crumb';
import { GalleryToggle } from '@/components/organize/gallery-toggle';

export const metadata: Metadata = { title: 'Event overview' };

export default async function OrganizeOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { access } = await loadOrganizerEvent(id);
  const event = toEvent(access.event);
  const canEdit = can(access.roles, 'event.edit');
  const sql = getSql();
  const [counts, [{ now }]] = can(access.roles, 'event.view_staff')
    ? await Promise.all([countSubmissions(sql, event.id), sql<[{ now: Date }]>`select now()`])
    : [null, [{ now: new Date() }]];

  return (
    <>
      <div className="page-head">
        <div>
          <EventCrumb event={access.event} />
          <h1 className="h1">Overview</h1>
        </div>
        <Link className="btn" href={`/events/${event.slug}`}>
          View event page
        </Link>
      </div>
      <StatusCard event={event} canEdit={canEdit} />
      {counts && event.status !== 'draft' ? (
        <SubmissionsCard
          eventId={event.id}
          counts={counts}
          deadline={event.submission_deadline}
          lockedAt={event.submissions_locked_at}
          timezone={event.timezone}
          serverNow={now.toISOString()}
          canReopen={
            can(access.roles, 'submissions.reopen') &&
            (event.status === 'published' || event.status === 'live')
          }
        />
      ) : null}
      {can(access.roles, 'gallery.publish') ? (
        <section className="panel card stack-sm" aria-labelledby="gallery-title">
          <div className="row-between">
            <h2 id="gallery-title" className="h2">
              Project gallery
            </h2>
            <span className={galleryOpen(event) ? 'chip chip-success' : 'chip chip-muted'}>
              {galleryOpen(event) ? 'Public' : 'Hidden'}
            </span>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            {galleryOpen(event)
              ? 'Everyone can browse the submitted projects.'
              : 'Only owners and admins can see the submitted projects. Publish the gallery to show them to everyone, at any time.'}{' '}
            <Link href={`/events/${event.slug}/gallery`}>Open the gallery</Link>
          </p>
          <GalleryToggle
            eventId={event.id}
            published={event.gallery_published_at !== null}
            completed={event.status === 'completed'}
          />
        </section>
      ) : null}
      {canEdit ? (
        <EventForm mode="edit" event={event} timezones={listTimezones()} />
      ) : (
        <div className="panel empty">
          <strong>
            {can(access.roles, 'scores.write')
              ? 'You are judging this event'
              : can(access.roles, 'checkins.scan')
                ? 'You are on the door team'
                : 'Your tools for this event arrive with later releases'}
          </strong>
          {can(access.roles, 'mentor.claim') ? (
            <Link className="btn btn-primary" href={`/organize/${event.id}/mentors`}>
              Open the mentor queue
            </Link>
          ) : null}
          {can(access.roles, 'scores.write') ? (
            <Link className="btn btn-primary" href={`/organize/${event.id}/judging`}>
              Open your judging queue
            </Link>
          ) : can(access.roles, 'checkins.scan') ? (
            <Link className="btn btn-primary" href={`/organize/${event.id}/check-in`}>
              Open the scanner
            </Link>
          ) : (
            <span>Your tools are in the sidebar.</span>
          )}
        </div>
      )}
      {can(access.roles, 'records.delete') ? (
        <section className="panel card stack-sm" aria-labelledby="danger-title">
          <h2 id="danger-title" className="h2" style={{ fontSize: 18 }}>
            Delete this event
          </h2>
          <p className="muted small" style={{ margin: 0 }}>
            It disappears for everyone, but nothing is lost: restore it from Organize. Audited.
          </p>
          <DeleteEventButton eventId={event.id} name={event.name} />
        </section>
      ) : null}
    </>
  );
}

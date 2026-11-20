import { toEvent } from '@hx/db';
import { can, listTimezones } from '@hx/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EventForm } from '@/components/organize/event-form';
import { StatusCard } from '@/components/organize/status-card';
import { loadOrganizerEvent } from '@/lib/server/organize';

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

  return (
    <>
      <div className="page-head">
        <div>
          <p className="crumb">{event.name}</p>
          <h1 className="h1">Overview</h1>
        </div>
        <Link className="btn" href={`/events/${event.slug}`}>
          View event page
        </Link>
      </div>
      <StatusCard event={event} canEdit={canEdit} />
      {canEdit ? (
        <EventForm mode="edit" event={event} timezones={listTimezones()} />
      ) : (
        <div className="raised empty">
          <strong>Your tools for this event arrive with later releases</strong>
          <span>Judging, mentoring and check-in screens will appear here.</span>
        </div>
      )}
    </>
  );
}

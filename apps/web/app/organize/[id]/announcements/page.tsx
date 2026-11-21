import { getSql, listAnnouncements } from '@hx/db';
import { can } from '@hx/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AnnouncementFeed } from '@/components/live/announcements';
import { loadOrganizerEvent } from '@/lib/server/organize';
import { EventCrumb } from '@/components/organize/event-crumb';

export const metadata: Metadata = { title: 'Announcements' };

export default async function AnnouncementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { viewer, access } = await loadOrganizerEvent(id);
  if (!can(access.roles, 'announcements.write')) notFound();
  const initial = await listAnnouncements(getSql(), id);
  return (
    <>
      <div className="page-head">
        <div>
          <EventCrumb event={access.event} />
          <h1 className="h1">Announcements</h1>
        </div>
      </div>
      <AnnouncementFeed eventId={id} initial={initial} timezone={viewer.timezone} canPost />
    </>
  );
}

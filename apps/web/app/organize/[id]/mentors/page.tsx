import { getSql, listMentorRequests } from '@hx/db';
import { can } from '@hx/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MentorQueue } from '@/components/live/mentor-queue';
import { loadOrganizerEvent } from '@/lib/server/organize';
import { EventCrumb } from '@/components/organize/event-crumb';

export const metadata: Metadata = { title: 'Mentor queue' };

export default async function MentorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { viewer, access } = await loadOrganizerEvent(id);
  if (!can(access.roles, 'mentor.view')) notFound();
  const initial = await listMentorRequests(getSql(), id);
  return (
    <>
      <div className="page-head">
        <div>
          <EventCrumb event={access.event} />
          <h1 className="h1">Mentor queue</h1>
        </div>
      </div>
      <MentorQueue
        eventId={id}
        viewerId={viewer.userId}
        canClaim={can(access.roles, 'mentor.claim')}
        initial={initial}
      />
    </>
  );
}

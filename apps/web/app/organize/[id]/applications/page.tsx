import { getSql, listApplications, toEvent } from '@hx/db';
import { can } from '@hx/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApplicationsReview } from '@/components/organize/applications-review';
import { loadOrganizerEvent } from '@/lib/server/organize';
import { chipClass, EVENT_STATUS } from '@/lib/ui/status';

export const metadata: Metadata = { title: 'Applications' };

export default async function ApplicationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { viewer, access } = await loadOrganizerEvent(id);
  if (!can(access.roles, 'applications.decide')) notFound();
  const event = toEvent(access.event);
  const initial = await listApplications(getSql(), id, { status: 'submitted', limit: 50 });
  const status = EVENT_STATUS[event.status];

  return (
    <>
      <div className="page-head">
        <div>
          <p className="crumb">
            {event.name} <span className={chipClass(status.tone)}>{status.label}</span>
          </p>
          <h1 className="h1">Applications</h1>
        </div>
      </div>
      <ApplicationsReview
        eventId={id}
        questions={event.application_questions}
        timezone={viewer.timezone}
        initial={initial}
      />
    </>
  );
}

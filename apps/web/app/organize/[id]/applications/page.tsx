import { getSql, listApplications, toEvent } from '@hx/db';
import { can } from '@hx/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApplicationsReview } from '@/components/organize/applications-review';
import { loadOrganizerEvent } from '@/lib/server/organize';
import { eventPhase } from '@/lib/ui/event-phase';

export const metadata: Metadata = { title: 'Applications' };

export default async function ApplicationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { viewer, access } = await loadOrganizerEvent(id);
  if (!can(access.roles, 'applications.decide')) notFound();
  const event = toEvent(access.event);
  const initial = await listApplications(getSql(), id, { status: 'submitted', limit: 50 });

  return (
    <ApplicationsReview
      eventId={id}
      eventName={event.name}
      eventBadge={eventPhase(event)}
      questionsHref={can(access.roles, 'event.edit') ? `/organize/${id}/questions` : null}
      questions={event.application_questions}
      timezone={viewer.timezone}
      initial={initial}
    />
  );
}

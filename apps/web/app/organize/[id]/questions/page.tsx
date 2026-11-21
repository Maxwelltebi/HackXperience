import { toEvent } from '@hx/db';
import { can } from '@hx/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { QuestionsEditor } from '@/components/organize/questions-editor';
import { loadOrganizerEvent } from '@/lib/server/organize';
import { EventCrumb } from '@/components/organize/event-crumb';

export const metadata: Metadata = { title: 'Application form' };

export default async function QuestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access } = await loadOrganizerEvent(id);
  if (!can(access.roles, 'event.edit')) notFound();
  const event = toEvent(access.event);

  return (
    <>
      <div className="page-head">
        <div>
          <EventCrumb event={access.event} />
          <h1 className="h1">Application form</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Name, email, school and level come from each applicant&apos;s profile. Ask only what
            else you need.
          </p>
        </div>
      </div>
      <QuestionsEditor eventId={id} initial={event.application_questions} />
    </>
  );
}

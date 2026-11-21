import { getSql, listTeamsForOrganizer } from '@hx/db';
import { can } from '@hx/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TeamsAdmin } from '@/components/organize/teams-admin';
import { loadOrganizerEvent } from '@/lib/server/organize';
import { EventCrumb } from '@/components/organize/event-crumb';

export const metadata: Metadata = { title: 'Teams' };

/** Every team with its members and project; owners can delete and restore (audited). */
export default async function TeamsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access } = await loadOrganizerEvent(id);
  if (!can(access.roles, 'event.view_staff')) notFound();
  const teams = await listTeamsForOrganizer(getSql(), id);
  return (
    <>
      <div className="page-head">
        <div>
          <EventCrumb event={access.event} />
          <h1 className="h1">Teams</h1>
        </div>
        <span className="mono">{teams.filter((t) => !t.deleted_at).length} teams</span>
      </div>
      <TeamsAdmin eventId={id} teams={teams} canDelete={can(access.roles, 'records.delete')} />
    </>
  );
}

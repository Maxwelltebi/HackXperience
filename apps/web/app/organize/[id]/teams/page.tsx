import { submissionsClosed } from '@hx/core';
import { getSql, getTeamFormation, listTeamsForOrganizer } from '@hx/db';
import { can } from '@hx/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TeamFormationPanel } from '@/components/organize/team-formation';
import { TeamsAdmin } from '@/components/organize/teams-admin';
import { loadOrganizerEvent } from '@/lib/server/organize';
import { EventCrumb } from '@/components/organize/event-crumb';

export const metadata: Metadata = { title: 'Teams' };

/**
 * Forming teams from skill ratings (R36), then every team with its members and project; owners
 * can delete and restore (audited).
 */
export default async function TeamsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access } = await loadOrganizerEvent(id);
  if (!can(access.roles, 'event.view_staff')) notFound();
  const sql = getSql();
  const canForm = can(access.roles, 'teams.form');
  const [teams, formation, [{ now }]] = await Promise.all([
    listTeamsForOrganizer(sql, id),
    canForm ? getTeamFormation(sql, id) : null,
    sql<[{ now: Date }]>`select now()`,
  ]);
  return (
    <>
      <div className="page-head">
        <div>
          <EventCrumb event={access.event} />
          <h1 className="h1">Teams</h1>
        </div>
        <span className="mono">{teams.filter((t) => !t.deleted_at).length} teams</span>
      </div>
      {formation ? (
        <TeamFormationPanel
          eventId={id}
          initial={formation}
          closed={submissionsClosed(access.event, now)}
        />
      ) : null}
      <TeamsAdmin eventId={id} teams={teams} canDelete={can(access.roles, 'records.delete')} />
    </>
  );
}

import { submissionsClosed } from '@hx/core';
import { getMyApplication, getMyTeam, getSql, listOpenTeams, listTeamMentorRequests } from '@hx/db';
import { formatDateTime } from '@hx/shared';
import type { Metadata } from 'next';
import Link from '@/components/link';
import { redirect } from 'next/navigation';
import { TeamMentorPanel } from '@/components/live/mentor-queue';
import { SkillsPanel } from '@/components/participant/skills-panel';
import { TeamPanel } from '@/components/participant/team-panel';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { loadEventForPage } from '@/lib/server/event-page';
import { getViewer, headerProps } from '@/lib/server/viewer';

export const metadata: Metadata = { title: 'Your team' };
export const dynamic = 'force-dynamic';

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=/events/${slug}/team`);
  const { event } = await loadEventForPage(slug, viewer.userId);
  const sql = getSql();
  const application = await getMyApplication(sql, event.id, viewer.userId);
  if (application?.status !== 'confirmed') redirect(`/events/${slug}`);

  const [team, board] = await Promise.all([
    getMyTeam(sql, event.id, viewer.userId),
    listOpenTeams(sql, event.id),
  ]);
  const closed = submissionsClosed(event, new Date());

  return (
    <>
      <SiteHeader {...headerProps(viewer)} />
      <main className="container page" style={{ maxWidth: 880 }}>
        <div>
          <p className="crumb">
            <Link href={`/events/${slug}`}>{event.name}</Link>
          </p>
          <h1 className="h1">Your team</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Teams of{' '}
            {event.team_size_min === event.team_size_max
              ? event.team_size_max
              : `${event.team_size_min} to ${event.team_size_max}`}
            .{' '}
            {closed
              ? 'Teams are final: the submission deadline has passed.'
              : `You can change teams until ${formatDateTime(event.submission_deadline.toISOString(), viewer.timezone)}.`}
          </p>
        </div>
        <TeamPanel
          eventId={event.id}
          viewerId={viewer.userId}
          initialTeam={team}
          initialBoard={board}
          teamSizeMax={event.team_size_max}
          closed={closed}
        />
        {!team && !closed ? (
          <SkillsPanel eventId={event.id} initial={application.skill_ratings} />
        ) : null}
        {team ? (
          <TeamMentorPanel
            eventId={event.id}
            teamId={team.id}
            live={event.status === 'live'}
            initial={await listTeamMentorRequests(sql, event.id, viewer.userId)}
          />
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}

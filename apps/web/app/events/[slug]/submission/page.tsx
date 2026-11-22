import { submissionsClosed } from '@hx/core';
import {
  getEventSetup,
  getMyApplication,
  getMyImages,
  getMySubmission,
  getMyTeam,
  getSql,
  getTeamFeedback,
} from '@hx/db';
import { formatDateTime } from '@hx/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SubmissionEditor } from '@/components/participant/submission-editor';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { loadEventForPage } from '@/lib/server/event-page';
import { getViewer, headerProps } from '@/lib/server/viewer';
import { BackLink } from '@/components/back-link';

export const metadata: Metadata = { title: 'Your submission' };
export const dynamic = 'force-dynamic';

export default async function SubmissionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=/events/${slug}/submission`);
  const { event } = await loadEventForPage(slug, viewer.userId);
  const sql = getSql();
  const application = await getMyApplication(sql, event.id, viewer.userId);
  if (application?.status !== 'confirmed') redirect(`/events/${slug}`);
  const team = await getMyTeam(sql, event.id, viewer.userId);
  if (!team) redirect(`/events/${slug}/team`);

  const [submission, setup, [{ now }], images] = await Promise.all([
    getMySubmission(sql, event.id, viewer.userId),
    getEventSetup(sql, event.id),
    sql<[{ now: Date }]>`select now()`,
    getMyImages(sql, event.id, viewer.userId),
  ]);
  const deadline = event.submission_deadline.toISOString();
  const feedback =
    event.status === 'completed' ? await getTeamFeedback(sql, event.id, viewer.userId) : null;

  return (
    <>
      <SiteHeader {...headerProps(viewer)} />
      <main className="container page" style={{ maxWidth: 840 }}>
        <div>
          <BackLink href={`/events/${slug}`}>Back to the event</BackLink>
          <h1 className="h1">Your submission</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            {team.name}. Anyone on the team can edit it until{' '}
            {formatDateTime(deadline, viewer.timezone)}.
          </p>
        </div>
        {feedback ? (
          <section className="panel card stack" aria-labelledby="feedback-title">
            <h2 id="feedback-title" className="h2">
              Judge feedback
            </h2>
            {feedback.items.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                The judges didn&apos;t leave comments on your project.
              </p>
            ) : (
              feedback.items.map((item, i) => (
                <div key={i} className="well card-tight stack-sm">
                  <span className="muted small">
                    {item.judge} · {item.criterion_name}
                  </span>
                  <span style={{ whiteSpace: 'pre-wrap' }}>{item.comment}</span>
                </div>
              ))
            )}
          </section>
        ) : null}
        <SubmissionEditor
          eventId={event.id}
          teamId={team.id}
          viewerId={viewer.userId}
          initial={submission}
          tracks={setup.tracks}
          maxTracks={event.max_tracks_per_submission}
          memberCount={team.members.length}
          teamSizeMin={event.team_size_min}
          deadline={deadline}
          serverNow={now.toISOString()}
          timezone={viewer.timezone}
          images={images.items}
          closed={submissionsClosed(event, now)}
        />
      </main>
      <SiteFooter />
    </>
  );
}

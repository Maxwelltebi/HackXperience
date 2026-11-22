import { getEventSetup, getJudgeQueue, getSql, getSubmissionForJudging } from '@hx/db';
import { ApiError, can, uuidSchema } from '@hx/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Markdown from '@/components/markdown';
import { ScoreForm } from '@/components/organize/score-form';
import { loadOrganizerEvent } from '@/lib/server/organize';
import { chipClass, SHA_STATUS } from '@/lib/ui/status';
import { BackLink } from '@/components/back-link';
import { ProjectShowcase } from '@/components/project-showcase';

export const metadata: Metadata = { title: 'Score a project' };

export default async function ScoreProjectPage({
  params,
}: {
  params: Promise<{ id: string; sid: string }>;
}) {
  const { id, sid } = await params;
  const { viewer, access } = await loadOrganizerEvent(id);
  const readAll = can(access.roles, 'submissions.read_all');
  const isJudge = can(access.roles, 'scores.write');
  if ((!readAll && !isJudge) || !uuidSchema.safeParse(sid).success) notFound();
  const sql = getSql();

  const submission = await getSubmissionForJudging(sql, id, sid, {
    userId: viewer.userId,
    readAll,
  }).catch((error: unknown) => {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') notFound();
    throw error;
  });
  const [setup, queue] = await Promise.all([
    getEventSetup(sql, id),
    isJudge ? getJudgeQueue(sql, id, viewer.userId) : null,
  ]);
  const position = queue?.items.findIndex((i) => i.submission_id === sid) ?? -1;
  const next = queue && position >= 0 ? queue.items[position + 1] : undefined;
  const assigned = position >= 0;
  const tracks = setup.tracks.filter((t) => submission.track_ids.includes(t.id));

  return (
    <>
      <div className="page-head">
        <div>
          <BackLink href={`/organize/${id}/judging`}>Back to judging</BackLink>
          <h1 className="h1">{submission.title || 'Untitled'}</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            {submission.team_name}
            {tracks.length > 0 ? ` · ${tracks.map((t) => t.name).join(', ')}` : ''}
            {queue && assigned ? ` · ${position + 1} of ${queue.total} in your queue` : ''}
          </p>
        </div>
      </div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="panel card stack" aria-label="Project">
          {submission.tagline ? <p style={{ margin: 0 }}>{submission.tagline}</p> : null}
          <ProjectShowcase images={submission.images} title={submission.title} />
          <dl className="dl">
            {submission.github_url ? (
              <>
                <dt>Code</dt>
                <dd className="small">
                  <a
                    href={submission.github_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    {submission.github_url.replace('https://', '')}
                  </a>
                  <span style={{ display: 'block', marginTop: 6 }}>
                    <span className={chipClass(SHA_STATUS[submission.sha_status].tone)}>
                      {SHA_STATUS[submission.sha_status].label}
                    </span>{' '}
                    {submission.locked_commit_sha ? (
                      <a
                        className="mono"
                        href={`${submission.github_url}/tree/${submission.locked_commit_sha}`}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                      >
                        {submission.locked_commit_sha.slice(0, 12)}
                      </a>
                    ) : null}
                  </span>
                </dd>
              </>
            ) : null}
            {submission.youtube_url ? (
              <>
                <dt>Video</dt>
                <dd className="small">
                  <a
                    href={submission.youtube_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    Watch on YouTube
                  </a>
                </dd>
              </>
            ) : null}
            {submission.demo_url ? (
              <>
                <dt>Demo</dt>
                <dd className="small">
                  <a href={submission.demo_url} target="_blank" rel="noopener noreferrer nofollow">
                    {submission.demo_url.replace('https://', '')}
                  </a>
                </dd>
              </>
            ) : null}
          </dl>
          {submission.write_up.trim() ? (
            <Markdown text={submission.write_up} />
          ) : (
            <p className="muted">No write-up.</p>
          )}
        </section>
        {assigned ? (
          <ScoreForm
            eventId={id}
            submissionId={sid}
            criteria={submission.criteria}
            initial={submission.my_scores}
            open={submission.judging_open}
            nextHref={
              next ? `/organize/${id}/judging/${next.submission_id}` : `/organize/${id}/judging`
            }
            nextLabel={next ? 'Next project' : 'Back to your queue'}
          />
        ) : (
          <section className="panel card">
            <p className="muted" style={{ margin: 0 }}>
              You&apos;re viewing this as an organizer. Only assigned judges score it.
            </p>
          </section>
        )}
      </div>
    </>
  );
}

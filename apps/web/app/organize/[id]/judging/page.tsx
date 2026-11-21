import {
  getEventSetup,
  getJudgeQueue,
  getPublishedStandings,
  getSql,
  getStandings,
  listAwardResults,
} from '@hx/db';
import { can } from '@hx/shared';
import type { Metadata } from 'next';
import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { JudgingManager } from '@/components/organize/judging-manager';
import { loadOrganizerEvent } from '@/lib/server/organize';
import { EventCrumb } from '@/components/organize/event-crumb';
import { chipClass } from '@/lib/ui/status';

export const metadata: Metadata = { title: 'Judging' };

export default async function JudgingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { viewer, access } = await loadOrganizerEvent(id);
  const isJudge = can(access.roles, 'scores.write');
  const manages = can(access.roles, 'judging.manage');
  if (!isJudge && !manages) notFound();
  const sql = getSql();
  const status = access.event.status;
  const completed = status === 'completed';

  const [queue, standings, awards, setup] = await Promise.all([
    isJudge ? getJudgeQueue(sql, id, viewer.userId) : null,
    manages ? (completed ? getPublishedStandings(sql, id) : getStandings(sql, id)) : null,
    manages ? listAwardResults(sql, id) : null,
    getEventSetup(sql, id),
  ]);
  const trackName = new Map(setup.tracks.map((t) => [t.id, t.name]));

  return (
    <>
      <div className="page-head">
        <div>
          <EventCrumb event={access.event} />
          <h1 className="h1">Judging</h1>
        </div>
      </div>

      {status !== 'judging' && !completed ? (
        <div className="panel empty">
          <strong>Judging hasn&apos;t started</strong>
          <span>
            {manages
              ? 'After the submission deadline, add a rubric under Tracks and schedule, then choose Start judging on the Overview.'
              : 'Your queue appears here once the organizers start judging and assign projects.'}
          </span>
        </div>
      ) : null}

      {queue ? (
        <section className="panel card stack" aria-labelledby="queue-title">
          <div className="row-between">
            <h2 id="queue-title" className="h2">
              Your queue
            </h2>
            <span className="mono">
              {queue.scored} of {queue.total} scored
            </span>
          </div>
          {queue.items.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No projects assigned to you yet.
            </p>
          ) : (
            <ul className="stack-sm" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {queue.items.map((item) => (
                <li key={item.submission_id}>
                  <Link
                    href={`/organize/${id}/judging/${item.submission_id}`}
                    className="well card-tight row-between"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <span>
                      <strong>{item.title || 'Untitled'}</strong>
                      <span className="muted small" style={{ display: 'block' }}>
                        {item.team_name}
                        {item.track_ids.length > 0
                          ? ` · ${item.track_ids.map((t) => trackName.get(t) ?? '').join(', ')}`
                          : ''}
                      </span>
                    </span>
                    <span className={chipClass(item.scored ? 'success' : 'warning')}>
                      {item.scored ? 'Scored' : 'To score'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {!queue.judging_open && queue.items.length > 0 ? (
            <p className="muted small" style={{ margin: 0 }}>
              {completed ? 'Results are published; scores are final.' : 'Scoring is closed.'}
            </p>
          ) : null}
        </section>
      ) : null}

      {standings && awards ? (
        <JudgingManager
          eventId={id}
          status={status}
          standings={standings}
          awards={awards}
          tracks={setup.tracks}
          rubricCount={setup.rubric.length}
        />
      ) : null}
    </>
  );
}

import { getResults, getSql } from '@hx/db';
import { ApiError, formatDate } from '@hx/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { loadEventForPage } from '@/lib/server/event-page';
import { getViewer, headerProps } from '@/lib/server/viewer';

export const metadata: Metadata = { title: 'Results' };
export const dynamic = 'force-dynamic';

/** Public results: awards and winners, from the snapshot frozen at publication. */
export default async function ResultsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  const { event } = await loadEventForPage(slug, viewer?.userId ?? null);
  const results = await getResults(getSql(), event.id).catch((error: unknown) => {
    if (error instanceof ApiError && error.code === 'RESULTS_NOT_PUBLISHED') return null;
    throw error;
  });
  const overall = results?.awards.filter((a) => a.track_id === null) ?? [];
  const byTrack = results?.awards.filter((a) => a.track_id !== null) ?? [];

  return (
    <>
      <SiteHeader {...headerProps(viewer)} />
      <main className="container page" style={{ maxWidth: 960 }}>
        <div className="page-head">
          <div>
            <p className="crumb">
              <Link href={`/events/${slug}`}>{event.name}</Link>
            </p>
            <h1 className="h1">Results</h1>
            {results ? (
              <p className="muted" style={{ margin: '6px 0 0' }}>
                Published {formatDate(results.published_at, viewer?.timezone ?? event.timezone)} ·{' '}
                <span className="mono">{results.projects}</span> projects judged
              </p>
            ) : null}
          </div>
          {results ? (
            <Link className="btn" href={`/events/${slug}/gallery`}>
              See every project
            </Link>
          ) : null}
        </div>

        {!results ? (
          <div className="panel empty">
            <strong>Results aren&apos;t out yet</strong>
            <span>They appear here as soon as the organizers publish them.</span>
          </div>
        ) : results.awards.length === 0 ? (
          <div className="panel empty">
            <strong>No awards were given</strong>
            <Link className="btn" href={`/events/${slug}/gallery`}>
              See every project
            </Link>
          </div>
        ) : (
          <>
            {[...overall, ...byTrack].map((award) => (
              <section key={award.award_id} className="panel card stack" aria-label={award.name}>
                <div className="row-between">
                  <h2 className="h2">{award.name}</h2>
                  <span className="chip chip-success">{award.track_name ?? 'Overall'}</span>
                </div>
                {award.winners.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    Not awarded.
                  </p>
                ) : (
                  award.winners.map((w) => (
                    <div key={w.team_id} className="well card-tight stack-sm">
                      <strong>
                        {w.submission_id ? (
                          <Link href={`/events/${slug}/gallery/${w.submission_id}`}>
                            {w.title || 'Untitled'}
                          </Link>
                        ) : (
                          w.title || 'Untitled'
                        )}
                      </strong>
                      {w.tagline ? <span className="small">{w.tagline}</span> : null}
                      <span className="muted small">
                        {w.team_name}:{' '}
                        {w.members.map((m, i) => (
                          <span key={m.user_id}>
                            {i > 0 ? ', ' : ''}
                            <Link href={`/users/${m.user_id}`}>{m.name || 'A participant'}</Link>
                          </span>
                        ))}
                      </span>
                    </div>
                  ))
                )}
              </section>
            ))}
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

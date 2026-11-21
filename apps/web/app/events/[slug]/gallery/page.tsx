import { getEventSetup, getSql, listGallery } from '@hx/db';
import { can } from '@hx/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { loadEventForPage } from '@/lib/server/event-page';
import { getViewer, headerProps } from '@/lib/server/viewer';

export const metadata: Metadata = { title: 'Projects' };
export const dynamic = 'force-dynamic';

/** The public project gallery, once results are published (organizers can preview it). */
export default async function GalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { slug } = await params;
  const { cursor } = await searchParams;
  const viewer = await getViewer();
  const access = await loadEventForPage(slug, viewer?.userId ?? null);
  const { event } = access;
  const open = event.status === 'completed' || can(access.roles, 'submissions.read_all');
  const sql = getSql();
  const [page, setup] = open
    ? await Promise.all([
        listGallery(sql, event.id, { cursor, limit: 30 }),
        getEventSetup(sql, event.id),
      ])
    : [null, null];
  const trackName = new Map(setup?.tracks.map((t) => [t.id, t.name]) ?? []);

  return (
    <>
      <SiteHeader {...headerProps(viewer)} />
      <main className="container page">
        <div className="page-head">
          <div>
            <p className="crumb">
              <Link href={`/events/${slug}`}>{event.name}</Link>
            </p>
            <h1 className="h1">Projects</h1>
            {event.status !== 'completed' && open ? (
              <p className="muted small" style={{ margin: '6px 0 0' }}>
                Organizer preview: the gallery goes public when results are published.
              </p>
            ) : null}
          </div>
          {event.status === 'completed' ? (
            <Link className="btn" href={`/events/${slug}/results`}>
              Results
            </Link>
          ) : null}
        </div>

        {!page ? (
          <div className="panel empty">
            <strong>The gallery opens with the results</strong>
            <span>Every submitted project appears here once results are published.</span>
          </div>
        ) : page.items.length === 0 ? (
          <div className="panel empty">
            <strong>No projects</strong>
          </div>
        ) : (
          <div className="grid-2">
            {page.items.map((item) => (
              <Link
                key={item.submission_id}
                href={`/events/${slug}/gallery/${item.submission_id}`}
                className="panel card stack-sm"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="row-between" style={{ alignItems: 'start', gap: 12 }}>
                  <h2 className="h2" style={{ fontSize: 20 }}>
                    {item.title || 'Untitled'}
                  </h2>
                  {item.awards.length > 0 ? (
                    <span className="chip chip-success">{item.awards[0]}</span>
                  ) : null}
                </div>
                {item.tagline ? <span>{item.tagline}</span> : null}
                <span className="muted small">
                  {item.team_name}
                  {item.track_ids.length > 0
                    ? ` · ${item.track_ids.map((t) => trackName.get(t) ?? '').join(', ')}`
                    : ''}
                </span>
              </Link>
            ))}
          </div>
        )}
        {page?.next_cursor ? (
          <Link
            className="btn"
            href={`/events/${slug}/gallery?cursor=${encodeURIComponent(page.next_cursor)}`}
          >
            More projects
          </Link>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}

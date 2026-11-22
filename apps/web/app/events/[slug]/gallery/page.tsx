import { getEventSetup, getSql, listGallery } from '@hx/db';
import { can, galleryOpen } from '@hx/shared';
import type { Metadata } from 'next';
import Link from '@/components/link';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { loadEventForPage } from '@/lib/server/event-page';
import { getViewer, headerProps } from '@/lib/server/viewer';
import { BackLink } from '@/components/back-link';
import Image from 'next/image';
import { GalleryToggle } from '@/components/organize/gallery-toggle';
import { projectImageUrl } from '@/lib/project-images';

export const metadata: Metadata = { title: 'Projects' };
export const dynamic = 'force-dynamic';

/**
 * The project gallery: public once an owner opens it or results are published (R40). Owners and
 * admins can preview it before then.
 */
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
  const isPublic = galleryOpen(event);
  const open = isPublic || can(access.roles, 'submissions.read_all');
  const canPublish = can(access.roles, 'gallery.publish');
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
            <BackLink href={`/events/${slug}`}>Back to the event</BackLink>
            <h1 className="h1">Projects</h1>
            {!isPublic && open ? (
              <p className="muted small" style={{ margin: '6px 0 0' }}>
                Organizer preview: only owners and admins can see this until the gallery is
                published.
              </p>
            ) : null}
          </div>
          {canPublish ? (
            <GalleryToggle
              eventId={event.id}
              published={event.gallery_published_at !== null}
              completed={event.status === 'completed'}
            />
          ) : event.status === 'completed' ? (
            <Link className="btn" href={`/events/${slug}/results`}>
              Results
            </Link>
          ) : null}
        </div>

        {!page ? (
          <div className="panel empty">
            <strong>The gallery isn&apos;t open yet</strong>
            <span>
              Every submitted project appears here once the organizers publish the gallery.
            </span>
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
                className={`${item.images[0] ? 'frame' : 'panel'} card gallery-card`}
              >
                {item.images[0] ? (
                  <div className="gallery-cover">
                    <Image
                      src={projectImageUrl(item.images[0].path)}
                      alt=""
                      width={item.images[0].width ?? 800}
                      height={item.images[0].height ?? 500}
                      sizes="(min-width: 720px) 560px, 100vw"
                      unoptimized
                    />
                  </div>
                ) : null}
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

import { getEventSetup, getSql, listGallery } from '@hx/db';
import { can, uuidSchema } from '@hx/shared';
import type { Metadata } from 'next';
import Link from '@/components/link';
import { notFound } from 'next/navigation';
import Markdown from '@/components/markdown';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { loadEventForPage } from '@/lib/server/event-page';
import { getViewer, headerProps } from '@/lib/server/viewer';

export const metadata: Metadata = { title: 'Project' };
export const dynamic = 'force-dynamic';

/** One project in the public gallery. */
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string; sid: string }>;
}) {
  const { slug, sid } = await params;
  if (!uuidSchema.safeParse(sid).success) notFound();
  const viewer = await getViewer();
  const access = await loadEventForPage(slug, viewer?.userId ?? null);
  const { event } = access;
  if (event.status !== 'completed' && !can(access.roles, 'submissions.read_all')) notFound();
  const sql = getSql();
  const [page, setup] = await Promise.all([
    listGallery(sql, event.id, { limit: 1, submissionId: sid }),
    getEventSetup(sql, event.id),
  ]);
  const item = page.items[0];
  if (!item) notFound();
  const tracks = setup.tracks.filter((t) => item.track_ids.includes(t.id));

  return (
    <>
      <SiteHeader {...headerProps(viewer)} />
      <main className="container page" style={{ maxWidth: 880 }}>
        <div>
          <p className="crumb">
            <Link href={`/events/${slug}/gallery`}>{event.name} projects</Link>
          </p>
          <h1 className="h1">{item.title || 'Untitled'}</h1>
          {item.tagline ? (
            <p className="muted" style={{ margin: '6px 0 0' }}>
              {item.tagline}
            </p>
          ) : null}
        </div>
        {item.awards.length > 0 ? (
          <p className="row" style={{ gap: 8, flexWrap: 'wrap', margin: 0 }}>
            {item.awards.map((a) => (
              <span key={a} className="chip chip-success">
                {a}
              </span>
            ))}
          </p>
        ) : null}
        <section className="panel card stack">
          <dl className="dl">
            <dt>Team</dt>
            <dd className="small">
              {item.team_name}:{' '}
              {item.members.map((m, i) => (
                <span key={m.user_id}>
                  {i > 0 ? ', ' : ''}
                  <Link href={`/users/${m.user_id}`}>{m.name || 'A participant'}</Link>
                </span>
              ))}
            </dd>
            {tracks.length > 0 ? (
              <>
                <dt>Tracks</dt>
                <dd className="small">{tracks.map((t) => t.name).join(', ')}</dd>
              </>
            ) : null}
            {item.github_url ? (
              <>
                <dt>Code</dt>
                <dd className="small">
                  <a href={item.github_url} target="_blank" rel="noopener noreferrer nofollow">
                    {item.github_url.replace('https://', '')}
                  </a>
                  {item.locked_commit_sha ? (
                    <span className="code muted"> at {item.locked_commit_sha.slice(0, 12)}</span>
                  ) : null}
                </dd>
              </>
            ) : null}
            {item.youtube_url ? (
              <>
                <dt>Video</dt>
                <dd className="small">
                  <a href={item.youtube_url} target="_blank" rel="noopener noreferrer nofollow">
                    Watch on YouTube
                  </a>
                </dd>
              </>
            ) : null}
            {item.demo_url ? (
              <>
                <dt>Demo</dt>
                <dd className="small">
                  <a href={item.demo_url} target="_blank" rel="noopener noreferrer nofollow">
                    {item.demo_url.replace('https://', '')}
                  </a>
                </dd>
              </>
            ) : null}
          </dl>
          {item.write_up.trim() ? <Markdown text={item.write_up} /> : null}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

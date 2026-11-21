import { getPublicProfile, getSql } from '@hx/db';
import { uuidSchema } from '@hx/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { getViewer, headerProps } from '@/lib/server/viewer';

export const metadata: Metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

/** A public profile with winner badges (DESIGN Step 1: badges on profiles, not certificates). */
export default async function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const [viewer, profile] = await Promise.all([getViewer(), getPublicProfile(getSql(), id)]);
  if (!profile) notFound();

  return (
    <>
      <SiteHeader {...headerProps(viewer)} />
      <main className="container page" style={{ maxWidth: 720 }}>
        <section className="raised card stack">
          <div>
            <p className="eyebrow">Hacker</p>
            <h1 className="h1">{profile.name || 'A participant'}</h1>
            {profile.school ? (
              <p className="muted" style={{ margin: '6px 0 0' }}>
                {profile.school}
              </p>
            ) : null}
          </div>
          {profile.bio ? <p style={{ margin: 0 }}>{profile.bio}</p> : null}
          {profile.github_username ? (
            <a
              className="small"
              href={`https://github.com/${profile.github_username}`}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              github.com/{profile.github_username}
            </a>
          ) : null}
        </section>
        <section className="raised card stack" aria-labelledby="badges-title">
          <h2 id="badges-title" className="h2">
            Badges
          </h2>
          {profile.badges.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No wins yet.
            </p>
          ) : (
            <ul className="stack-sm" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {profile.badges.map((b) => (
                <li
                  key={`${b.award_id}-${b.team_name}`}
                  className="inset card-tight row-between"
                  style={{ borderRadius: 20 }}
                >
                  <span>
                    <strong>{b.award_name}</strong>
                    <span className="muted small" style={{ display: 'block' }}>
                      <Link href={`/events/${b.event_slug}/results`}>{b.event_name}</Link> ·{' '}
                      {b.team_name}
                    </span>
                  </span>
                  <span className="chip chip-success">Winner</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

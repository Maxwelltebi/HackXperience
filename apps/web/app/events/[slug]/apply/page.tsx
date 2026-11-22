import { applicationsOpen } from '@hx/core';
import { getMyApplication, getSql, toEvent } from '@hx/db';
import type { Metadata } from 'next';
import Link from '@/components/link';
import { redirect } from 'next/navigation';
import { ApplicationForm } from '@/components/application-form';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { loadEventForPage } from '@/lib/server/event-page';
import { getViewer, headerProps } from '@/lib/server/viewer';
import { BackLink } from '@/components/back-link';

export const metadata: Metadata = { title: 'Apply' };
export const dynamic = 'force-dynamic';

export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=/events/${slug}/apply`);

  const access = await loadEventForPage(slug, viewer.userId);
  const event = toEvent(access.event);
  const existing = await getMyApplication(getSql(), event.id, viewer.userId);
  if (existing) redirect(`/events/${slug}`);
  const open = applicationsOpen({ ...event, deleted_at: null }, new Date());

  return (
    <>
      <SiteHeader {...headerProps(viewer)} />
      <main className="container page" style={{ maxWidth: 760 }}>
        <div>
          <BackLink href={`/events/${slug}`}>Back to the event</BackLink>
          <h1 className="h1">Apply</h1>
        </div>
        {open ? (
          <ApplicationForm
            eventId={event.id}
            slug={slug}
            questions={event.application_questions}
            profileComplete={Boolean(viewer.me.profile.school && viewer.me.profile.level_of_study)}
          />
        ) : (
          <div className="panel empty">
            <strong>Applications are closed</strong>
            <Link href={`/events/${slug}`}>Back to the event</Link>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

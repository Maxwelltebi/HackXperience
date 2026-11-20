import { listTimezones } from '@hx/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { EventForm } from '@/components/organize/event-form';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { getViewer, headerProps } from '@/lib/server/viewer';

export const metadata: Metadata = { title: 'New event' };
export const dynamic = 'force-dynamic';

export default async function NewEventPage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/sign-in?next=/organize/new');
  const orgId = viewer.me.org_ids[0];

  return (
    <>
      <SiteHeader {...headerProps(viewer)} />
      <main className="container page" style={{ maxWidth: 960 }}>
        <div>
          <p className="crumb">
            <Link href="/organize">Your events</Link>
          </p>
          <h1 className="h1">New event</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            It starts as a private draft. Add tracks, questions and staff, then publish it.
          </p>
        </div>
        {orgId ? (
          <EventForm
            mode="create"
            orgId={orgId}
            timezones={listTimezones()}
            defaultTimezone={viewer.timezone}
          />
        ) : (
          <div className="raised empty">
            <strong>Only organization members can create events</strong>
            <span>Ask a CIReN admin to add you.</span>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

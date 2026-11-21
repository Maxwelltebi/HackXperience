import { getSql, liveStats } from '@hx/db';
import { can } from '@hx/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StaffDashboard } from '@/components/live/staff-dashboard';
import { loadOrganizerEvent } from '@/lib/server/organize';
import { EventCrumb } from '@/components/organize/event-crumb';

export const metadata: Metadata = { title: 'Live dashboard' };

export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access } = await loadOrganizerEvent(id);
  if (!can(access.roles, 'live.view')) notFound();
  const initial = await liveStats(getSql(), id);
  return (
    <>
      <div className="page-head">
        <div>
          <EventCrumb event={access.event} />
          <h1 className="h1">Live dashboard</h1>
          <p className="muted small" style={{ margin: '6px 0 0' }}>
            Updates as check-ins, submissions, scores and mentor requests happen.
          </p>
        </div>
      </div>
      <StaffDashboard eventId={id} initial={initial} />
    </>
  );
}

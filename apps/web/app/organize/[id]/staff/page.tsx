import { getSql, listStaff } from '@hx/db';
import { can } from '@hx/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StaffManager } from '@/components/organize/staff-manager';
import { loadOrganizerEvent } from '@/lib/server/organize';
import { EventCrumb } from '@/components/organize/event-crumb';

export const metadata: Metadata = { title: 'Staff' };

export default async function StaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { viewer, access } = await loadOrganizerEvent(id);
  if (!can(access.roles, 'staff.manage')) notFound();
  const staff = await listStaff(getSql(), id);

  return (
    <>
      <div className="page-head">
        <div>
          <EventCrumb event={access.event} />
          <h1 className="h1">Staff</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Each person signs in once with Google or GitHub before you can add them.
          </p>
        </div>
      </div>
      <StaffManager eventId={id} viewerId={viewer.userId} initial={staff} />
    </>
  );
}

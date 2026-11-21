import { checkInStats, getSql } from '@hx/db';
import { can } from '@hx/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckInScanner } from '@/components/organize/check-in-scanner';
import { EventCrumb } from '@/components/organize/event-crumb';
import { loadOrganizerEvent } from '@/lib/server/organize';

export const metadata: Metadata = { title: 'Check-in' };

export default async function CheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { viewer, access } = await loadOrganizerEvent(id);
  if (!can(access.roles, 'checkins.scan')) notFound();
  const stats = await checkInStats(getSql(), id);

  return (
    <CheckInScanner
      eventId={id}
      crumb={<EventCrumb event={access.event} />}
      timezone={viewer.timezone}
      canManual={can(access.roles, 'checkins.manual')}
      initialStats={stats}
    />
  );
}

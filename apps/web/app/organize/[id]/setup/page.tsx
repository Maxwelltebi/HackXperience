import { getEventSetup, getSql } from '@hx/db';
import { can } from '@hx/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SetupEditor } from '@/components/organize/setup-editor';
import { loadOrganizerEvent } from '@/lib/server/organize';

export const metadata: Metadata = { title: 'Tracks and schedule' };

export default async function SetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access } = await loadOrganizerEvent(id);
  if (!can(access.roles, 'event.edit')) notFound();
  const setup = await getEventSetup(getSql(), id);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="crumb">{access.event.name}</p>
          <h1 className="h1">Tracks and schedule</h1>
        </div>
      </div>
      <SetupEditor eventId={id} timezone={access.event.timezone} initial={setup} />
    </>
  );
}

import { getSql, listPlatformPeople } from '@hx/db';
import type { Metadata } from 'next';
import { PeopleManager } from '@/components/admin/people-manager';
import { getViewer } from '@/lib/server/viewer';

export const metadata: Metadata = { title: 'Organizers and admins · Platform admin' };

/** Who can create CIReN events, and who can run the platform (R43). */
export default async function AdminPeoplePage() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const people = await listPlatformPeople(getSql());
  return <PeopleManager initial={people} viewerId={viewer.userId} />;
}

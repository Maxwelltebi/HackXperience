import 'server-only';
import { getSql, loadEventRoles, type EventAccess } from '@hx/db';
import { uuidSchema } from '@hx/shared';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { getViewer, type Viewer } from './viewer';

/**
 * The event behind /organize/[id] for a signed-in staff member. Anyone without a staff role
 * at the event gets a 404, so organizer pages don't reveal which events exist.
 */
export const loadOrganizerEvent = cache(
  async (id: string): Promise<{ viewer: Viewer; access: EventAccess }> => {
    const viewer = await getViewer();
    if (!viewer) redirect(`/sign-in?next=/organize/${encodeURIComponent(id)}`);
    if (!uuidSchema.safeParse(id).success) notFound();
    const access = await loadEventRoles(getSql(), id, viewer.userId);
    if (!access || access.roles.length === 0) notFound();
    return { viewer, access };
  },
);

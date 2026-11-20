import 'server-only';
import { canSeeEvent, getEventBySlug, getSql, loadEventRoles, type EventAccess } from '@hx/db';
import { notFound } from 'next/navigation';
import { cache } from 'react';

/**
 * The event behind /events/[slug], with the viewer's roles. Drafts 404 for anyone who
 * can't edit them, exactly as the API does.
 */
export const loadEventForPage = cache(
  async (slug: string, userId: string | null): Promise<EventAccess> => {
    const row = await getEventBySlug(getSql(), slug);
    if (!row) notFound();
    const access = await loadEventRoles(getSql(), row.id, userId);
    if (!access || !canSeeEvent(access)) notFound();
    return access;
  },
);

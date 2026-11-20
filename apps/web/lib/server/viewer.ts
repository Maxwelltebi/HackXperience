import 'server-only';
import { getMe, getSql } from '@hx/db';
import type { MeResponse } from '@hx/shared';
import { cache } from 'react';
import { getSessionUserId } from '../supabase/server';

export interface Viewer {
  userId: string;
  me: MeResponse;
  /** Display zone for times (Agent rule 23). */
  timezone: string;
  /** Org member or staff somewhere: shows the Organize link. */
  canOrganize: boolean;
}

/** The signed-in person for this request, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const me = await getMe(getSql(), userId);
  if (!me) return null;
  return {
    userId,
    me,
    timezone: me.profile.timezone,
    canOrganize: me.org_ids.length > 0 || me.event_roles.length > 0,
  };
});

/** Header props for SiteHeader. */
export function headerProps(viewer: Viewer | null): { signedIn: boolean; canOrganize: boolean } {
  return { signedIn: viewer !== null, canOrganize: viewer?.canOrganize ?? false };
}

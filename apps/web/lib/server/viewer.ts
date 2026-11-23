import 'server-only';
import { getMe, getSql } from '@hx/db';
import { CIREN_ORG_ID, type MeResponse } from '@hx/shared';
import { cache } from 'react';
import { getSessionUserId } from '../supabase/server';

export interface Viewer {
  userId: string;
  me: MeResponse;
  /** Display zone for times (Agent rule 23). */
  timezone: string;
  /** Org member, staff somewhere, or platform admin: shows the Organize link. */
  canOrganize: boolean;
  /** Platform admin (R43): shows the Admin link; owner rights at every event. */
  isPlatformAdmin: boolean;
  /** The organization new events go under: theirs, or CIReN for a platform admin. Null: can't create. */
  orgId: string | null;
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
    canOrganize: me.org_ids.length > 0 || me.event_roles.length > 0 || me.user.is_platform_admin,
    isPlatformAdmin: me.user.is_platform_admin,
    orgId: me.org_ids[0] ?? (me.user.is_platform_admin ? CIREN_ORG_ID : null),
  };
});

/** Header props for SiteHeader. */
export function headerProps(viewer: Viewer | null): {
  signedIn: boolean;
  canOrganize: boolean;
  isAdmin: boolean;
} {
  return {
    signedIn: viewer !== null,
    canOrganize: viewer?.canOrganize ?? false,
    isAdmin: viewer?.isPlatformAdmin ?? false,
  };
}

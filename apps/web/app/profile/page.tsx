import { getMe, getSql } from '@hx/db';
import { listTimezones } from '@hx/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ProfileForm } from '@/components/profile-form';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { getSessionUserId } from '@/lib/supabase/server';
import styles from './page.module.css';

export const metadata: Metadata = { title: 'Your profile' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const userId = await getSessionUserId();
  if (!userId) redirect('/sign-in?next=/profile');

  const me = await getMe(getSql(), userId);
  if (!me) redirect('/sign-in?error=callback');

  const timezones = listTimezones();
  if (!timezones.includes(me.profile.timezone)) timezones.unshift(me.profile.timezone);

  return (
    <>
      <SiteHeader
        signedIn
        canOrganize={
          me.org_ids.length > 0 || me.event_roles.length > 0 || me.user.is_platform_admin
        }
        isAdmin={me.user.is_platform_admin}
      />
      <main className={`container ${styles.main}`}>
        <div className={styles.heading}>
          <div>
            <p className="eyebrow">Your account</p>
            <h1 className="h1">Profile</h1>
            <p className="muted small" style={{ margin: '6px 0 0' }}>
              Signed in as {me.user.email}
            </p>
          </div>
          <form action="/auth/sign-out" method="post">
            <button className="btn" type="submit">
              Sign out
            </button>
          </form>
        </div>
        <ProfileForm initial={me} timezones={timezones} />
      </main>
      <SiteFooter />
    </>
  );
}

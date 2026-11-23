import { countApplications, getSql } from '@hx/db';
import { can } from '@hx/shared';
import Link from '@/components/link';
import type { ReactNode } from 'react';
import { SidebarNav, type NavItem } from '@/components/organize/sidebar-nav';
import { Brand } from '@/components/site-chrome';
import { loadOrganizerEvent } from '@/lib/server/organize';
import { initials } from '@/lib/ui/initials';

export const dynamic = 'force-dynamic';

const ROLE_LABEL = {
  owner: 'Owner',
  admin: 'Admin',
  judge: 'Judge',
  mentor: 'Mentor',
  volunteer: 'Volunteer',
} as const;

/** Organizer shell (screens PDF pages 11 and 12): a dark sidebar, then the page. */
export default async function OrganizeEventLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { viewer, access } = await loadOrganizerEvent(id);
  const base = `/organize/${id}`;
  const roles = access.roles;

  const items: NavItem[] = [{ href: base, label: 'Overview' }];
  if (can(roles, 'applications.decide')) {
    const counts = await countApplications(getSql(), id);
    items.push({ href: `${base}/applications`, label: 'Applications', count: counts.submitted });
  }
  if (can(roles, 'checkins.scan')) items.push({ href: `${base}/check-in`, label: 'Check-in' });
  if (can(roles, 'event.view_staff')) items.push({ href: `${base}/teams`, label: 'Teams' });
  if (can(roles, 'judging.manage') || can(roles, 'scores.write')) {
    items.push({ href: `${base}/judging`, label: 'Judging' });
  }
  if (can(roles, 'live.view')) items.push({ href: `${base}/live`, label: 'Live dashboard' });
  if (can(roles, 'announcements.write')) {
    items.push({ href: `${base}/announcements`, label: 'Announcements' });
  }
  if (can(roles, 'mentor.view')) items.push({ href: `${base}/mentors`, label: 'Mentor queue' });
  if (can(roles, 'reports.read')) items.push({ href: `${base}/report`, label: 'Impact report' });
  if (can(roles, 'event.edit')) {
    items.push({ href: `${base}/setup`, label: 'Tracks and schedule' });
    items.push({ href: `${base}/questions`, label: 'Application form' });
  }
  if (can(roles, 'staff.manage')) items.push({ href: `${base}/staff`, label: 'Staff' });

  const name = viewer.me.user.name || 'Signed in';
  // R43: a platform admin has owner rights here, staff role or not; say which applies.
  const role = access.platformAdmin ? 'Platform admin' : roles[0] ? ROLE_LABEL[roles[0]] : null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <Link href={`/events/${access.event.slug}`} className="sidebar-event">
          <small>CIReN</small>
          <strong>{access.event.name}</strong>
        </Link>
        <SidebarNav items={items} />
        <div className="sidebar-foot">
          <Link href="/organize">All your events</Link>
          {access.platformAdmin ? <Link href="/admin/events">Every event (admin)</Link> : null}
          <Link href="/profile" className="sidebar-user" style={{ textDecoration: 'none' }}>
            <span className="avatar" aria-hidden="true">
              {initials(name)}
            </span>
            <span>
              <strong>{name}</strong>
              {role ? <span>{role}</span> : null}
            </span>
          </Link>
        </div>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}

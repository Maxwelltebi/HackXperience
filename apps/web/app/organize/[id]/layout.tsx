import { countApplications, getSql } from '@hx/db';
import { can } from '@hx/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SidebarNav, type NavItem } from '@/components/organize/sidebar-nav';
import { Brand } from '@/components/site-chrome';
import { loadOrganizerEvent } from '@/lib/server/organize';

export const dynamic = 'force-dynamic';

/** Organizer shell from screens PDF page 8: sidebar with the event and its sections. */
export default async function OrganizeEventLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { access } = await loadOrganizerEvent(id);
  const base = `/organize/${id}`;
  const roles = access.roles;

  const items: NavItem[] = [{ href: base, label: 'Overview' }];
  if (can(roles, 'applications.decide')) {
    const counts = await countApplications(getSql(), id);
    items.push({ href: `${base}/applications`, label: 'Applications', count: counts.submitted });
  }
  if (can(roles, 'event.edit')) {
    items.push({ href: `${base}/setup`, label: 'Tracks and schedule' });
    items.push({ href: `${base}/questions`, label: 'Application form' });
  }
  if (can(roles, 'staff.manage')) items.push({ href: `${base}/staff`, label: 'Staff' });

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="row-between">
          <Brand />
        </div>
        <Link href={`/events/${access.event.slug}`} className="sidebar-event">
          <small>CIReN</small>
          <strong>{access.event.name}</strong>
        </Link>
        <SidebarNav items={items} />
        <Link href="/organize" className="small muted" style={{ paddingLeft: 16 }}>
          All your events
        </Link>
      </aside>
      <main className="page" style={{ paddingTop: 0 }}>
        {children}
      </main>
    </div>
  );
}

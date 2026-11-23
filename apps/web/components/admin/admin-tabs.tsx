'use client';

import { usePathname } from 'next/navigation';
import Link from '@/components/link';

const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/events', label: 'Events' },
  { href: '/admin/people', label: 'Organizers and admins' },
];

/** The platform admin area's sections (R43). */
export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="tabs" aria-label="Platform admin">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          className="tab"
          href={tab.href}
          aria-current={pathname === tab.href ? 'page' : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

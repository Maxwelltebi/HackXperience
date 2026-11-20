'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  href: string;
  label: string;
  count?: number;
}

/** The organizer sidebar links; the current page is marked inset and green. */
export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="sidebar-nav" aria-label="Event">
      {items.map((item, index) => {
        const current = index === 0 ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="nav-item"
            aria-current={current ? 'page' : undefined}
          >
            {item.label}
            {item.count !== undefined ? <span className="count">{item.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

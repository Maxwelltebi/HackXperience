'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from '@/components/link';
import { CloseIcon, MenuIcon } from './icons';

export type NavItem = { href: string; label: string; current?: boolean };

/**
 * The header's links on narrow screens, behind a menu button. It closes when the next page has
 * loaded (so the loading grid shows on the tapped link meanwhile), on a same-page link, or on
 * Escape.
 */
export function MobileMenu({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  // The page the menu was opened on: moving to another page closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenOn(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="btn btn-sm menu-button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpenOn(open ? null : pathname)}
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>
      <nav id="mobile-menu" className="mobile-menu" aria-label="Main" hidden={!open}>
        <ul className="container">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={item.current ? 'page' : undefined}
                onClick={() => {
                  const path = item.href.split('#')[0] || pathname;
                  if (path === pathname) setOpenOn(null);
                }}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

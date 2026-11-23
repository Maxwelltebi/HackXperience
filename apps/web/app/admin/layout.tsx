import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminTabs } from '@/components/admin/admin-tabs';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { getViewer, headerProps } from '@/lib/server/viewer';

export const metadata: Metadata = { title: 'Platform admin', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * The platform admin area (R43): the whole platform at a glance, every event, and who can
 * organize. Only platform admins. Anyone else, signed in or not, gets the ordinary 404 page:
 * no sign-in prompt, nothing that says an admin area exists (R44).
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  if (!viewer?.isPlatformAdmin) notFound();

  return (
    <>
      <SiteHeader {...headerProps(viewer)} />
      <main className="container page">
        <div>
          <p className="eyebrow">Platform admin</p>
          <h1 className="h1">HackXperience</h1>
        </div>
        <AdminTabs />
        {children}
      </main>
      <SiteFooter />
    </>
  );
}

import { uuidSchema } from '@hx/shared';
import type { Metadata } from 'next';
import { UnsubscribeForm } from '@/components/alerts/unsubscribe-form';
import Link from '@/components/link';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { getViewer, headerProps } from '@/lib/server/viewer';

export const metadata: Metadata = { title: 'Event alerts', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * Where the unsubscribe link in every alert email lands (R42). Opening the link changes nothing:
 * the button does, so mail scanners that open links can't unsubscribe anyone.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = uuidSchema.safeParse(token);
  const viewer = await getViewer();

  return (
    <>
      <SiteHeader {...headerProps(viewer)} />
      <main className="container page" style={{ maxWidth: 560 }}>
        <section className="frame card stack" aria-labelledby="unsubscribe-title">
          <div>
            <p className="eyebrow">Event alerts</p>
            <h1 id="unsubscribe-title" className="h2">
              Stop event alert emails?
            </h1>
          </div>
          {valid.success ? (
            <UnsubscribeForm token={valid.data} />
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              This link is incomplete. Open the unsubscribe link from the email again, or copy the
              whole address into your browser.
            </p>
          )}
          <p className="small muted" style={{ margin: 0 }}>
            <Link href="/events">See upcoming events</Link>
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

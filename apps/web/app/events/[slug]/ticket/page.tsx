import { getSql, getTicket } from '@hx/db';
import { ApiError, formatTime } from '@hx/shared';
import type { Metadata } from 'next';
import Link from '@/components/link';
import { redirect } from 'next/navigation';
import { loadEventForPage } from '@/lib/server/event-page';
import { qrSvg } from '@/lib/server/qr';
import { getViewer } from '@/lib/server/viewer';
import { chipClass } from '@/lib/ui/status';
import styles from './page.module.css';
import { BackLink } from '@/components/back-link';

export const metadata: Metadata = { title: 'Your ticket' };
export const dynamic = 'force-dynamic';

/** Full-screen ticket for the door: big QR, name, and the code in mono for manual entry. */
export default async function TicketPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=/events/${slug}/ticket`);
  const access = await loadEventForPage(slug, viewer.userId);

  let ticket;
  try {
    ticket = await getTicket(getSql(), access.event.id, viewer.userId);
  } catch (error) {
    if (error instanceof ApiError) redirect(`/events/${slug}`);
    throw error;
  }
  const qr = await qrSvg(ticket.ticket_code);

  return (
    <main className={styles.page}>
      <BackLink href={`/events/${slug}`}>Back to the event</BackLink>
      <div className={`panel ${styles.card}`}>
        <p className="eyebrow">{ticket.event_name}</p>
        <h1 className="h1">{ticket.name}</h1>
        {ticket.checked_in_at ? (
          <span className={chipClass('success')}>
            Checked in {formatTime(ticket.checked_in_at, viewer.timezone)}
          </span>
        ) : null}
        <div className={styles.qr} dangerouslySetInnerHTML={{ __html: qr }} />
        <p className="code small muted" style={{ margin: 0, overflowWrap: 'anywhere' }}>
          {ticket.ticket_code}
        </p>
        <p className="muted small" style={{ margin: 0 }}>
          Turn your screen brightness up. If the scanner can&apos;t read it, a volunteer can type
          the code.
        </p>
      </div>
      <Link href={`/events/${slug}`}>Back to the event</Link>
    </main>
  );
}

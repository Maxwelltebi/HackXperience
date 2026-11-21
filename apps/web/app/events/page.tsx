import { getSql, listPublicEvents, toEventSummary } from '@hx/db';
import { formatDateTime } from '@hx/shared';
import type { Metadata } from 'next';
import Link from '@/components/link';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { getViewer, headerProps } from '@/lib/server/viewer';
import { eventPhase } from '@/lib/ui/event-phase';
import { chipClass, EVENT_MODE } from '@/lib/ui/status';

export const metadata: Metadata = { title: 'Events' };
export const dynamic = 'force-dynamic';

export default async function EventsPage() {
  const viewer = await getViewer();
  const events = (await listPublicEvents(getSql())).map(toEventSummary);
  const now = new Date();
  const upcoming = events.filter((e) => new Date(e.ends_at) >= now);
  const past = events.filter((e) => new Date(e.ends_at) < now);

  return (
    <>
      <SiteHeader {...headerProps(viewer)} current="events" />
      <main className="container page">
        <div>
          <p className="eyebrow">Events</p>
          <h1 className="h1">CIReN hackathons</h1>
        </div>

        <section className="stack" aria-labelledby="upcoming">
          <h2 id="upcoming" className="h2">
            Upcoming
          </h2>
          {upcoming.length === 0 ? (
            <div className="panel empty">
              <strong>No upcoming events yet</strong>
              <span>The next CIReN hackathon appears here as soon as organizers publish it.</span>
            </div>
          ) : (
            upcoming.map((event) => {
              const phase = eventPhase(event, now);
              return (
                <article key={event.id} className="panel card stack-sm">
                  <div className="row-between">
                    <span className={chipClass(phase.tone)}>{phase.label}</span>
                    <span className="mono small muted">
                      {formatDateTime(event.starts_at, viewer?.timezone ?? event.timezone)}
                    </span>
                  </div>
                  <h3 className="h2">
                    <Link href={`/events/${event.slug}`} style={{ color: 'inherit' }}>
                      {event.name}
                    </Link>
                  </h3>
                  <p className="muted small" style={{ margin: 0 }}>
                    {EVENT_MODE[event.mode]}
                    {event.location ? ` · ${event.location}` : ''}
                  </p>
                </article>
              );
            })
          )}
        </section>

        {past.length > 0 ? (
          <section className="stack" aria-labelledby="past">
            <h2 id="past" className="h2">
              Past events
            </h2>
            <ul className="panel card stack-sm" style={{ listStyle: 'none', margin: 0 }}>
              {past.map((event) => (
                <li key={event.id} className="row-between">
                  <Link href={`/events/${event.slug}`}>{event.name}</Link>
                  <span className="mono small muted">
                    {formatDateTime(event.starts_at, viewer?.timezone ?? event.timezone)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}

import { applicationsOpen } from '@hx/core';
import { getEventSetup, getMyApplication, getSql, toEvent } from '@hx/db';
import { can, formatDateTime, type Event, type MyApplication } from '@hx/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { RsvpButtons } from '@/components/rsvp-buttons';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { loadEventForPage } from '@/lib/server/event-page';
import { getViewer, headerProps } from '@/lib/server/viewer';
import { APPLICATION_STATUS, chipClass, EVENT_MODE, EVENT_STATUS } from '@/lib/ui/status';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const viewer = await getViewer();
  const { event } = await loadEventForPage(slug, viewer?.userId ?? null);
  return { title: event.name };
}

export default async function EventPage({ params }: Props) {
  const { slug } = await params;
  const viewer = await getViewer();
  const access = await loadEventForPage(slug, viewer?.userId ?? null);
  const event = toEvent(access.event);
  const sql = getSql();
  const [setup, application] = await Promise.all([
    getEventSetup(sql, event.id),
    viewer ? getMyApplication(sql, event.id, viewer.userId) : Promise.resolve(null),
  ]);
  const zone = viewer?.timezone ?? event.timezone;
  const isOpen = applicationsOpen({ ...event, deleted_at: null }, new Date());
  const status = EVENT_STATUS[event.status];

  return (
    <>
      <SiteHeader {...headerProps(viewer)} />
      <main className="container page">
        <div className="page-head">
          <div>
            <p className="crumb">
              <Link href="/events">Events</Link>
              {event.status === 'draft' ? (
                <span className={chipClass(status.tone)}>{status.label}</span>
              ) : null}
            </p>
            <h1 className="display" style={{ fontSize: 'clamp(32px, 5vw, 44px)' }}>
              {event.name}
            </h1>
            <p className="muted" style={{ margin: '10px 0 0' }}>
              {EVENT_MODE[event.mode]}
              {event.location ? ` · ${event.location}` : ''}
            </p>
          </div>
          {can(access.roles, 'event.view_staff') ? (
            <Link className="btn" href={`/organize/${event.id}`}>
              Manage event
            </Link>
          ) : null}
        </div>

        <div className={styles.layout}>
          <div className="stack">
            {event.description ? (
              <section className="raised card">
                <p className={styles.description}>{event.description}</p>
              </section>
            ) : null}

            {setup.tracks.length > 0 ? (
              <section className="raised card stack-sm" aria-labelledby="tracks">
                <h2 id="tracks" className="h2">
                  Tracks
                </h2>
                <ul className={styles.tracks}>
                  {setup.tracks.map((track) => (
                    <li key={track.id}>
                      <strong>{track.name}</strong>
                      {track.description ? (
                        <span className="muted small">{track.description}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {setup.schedule.length > 0 ? (
              <section className="raised card stack-sm" aria-labelledby="schedule">
                <h2 id="schedule" className="h2">
                  Schedule
                </h2>
                <ol className={styles.schedule}>
                  {setup.schedule.map((item) => (
                    <li key={item.id}>
                      <span className="mono small">{formatDateTime(item.starts_at, zone)}</span>
                      <span>
                        <strong>{item.title}</strong>
                        {item.location ? (
                          <span className="muted small"> · {item.location}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>

          <aside className="stack">
            <ApplicationCard
              event={event}
              application={application}
              signedIn={viewer !== null}
              isOpen={isOpen}
              zone={zone}
            />
            <section className="raised card stack-sm" aria-label="Dates">
              <dl className="dl">
                <dt>Starts</dt>
                <dd className="small">{formatDateTime(event.starts_at, zone)}</dd>
                <dt>Submissions close</dt>
                <dd className="small">{formatDateTime(event.submission_deadline, zone)}</dd>
                <dt>Ends</dt>
                <dd className="small">{formatDateTime(event.ends_at, zone)}</dd>
                <dt>Teams</dt>
                <dd className="small">
                  {event.team_size_min === event.team_size_max
                    ? `${event.team_size_max} people`
                    : `${event.team_size_min} to ${event.team_size_max} people`}
                </dd>
              </dl>
              <p className="hint" style={{ margin: 0 }}>
                Times shown in {zone.replaceAll('_', ' ')}.{' '}
                {viewer ? <Link href="/profile">Change</Link> : null}
              </p>
            </section>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function ApplicationCard({
  event,
  application,
  signedIn,
  isOpen,
  zone,
}: {
  event: Event;
  application: MyApplication | null;
  signedIn: boolean;
  isOpen: boolean;
  zone: string;
}) {
  if (application) {
    const status = APPLICATION_STATUS[application.status];
    return (
      <section className="raised card stack" aria-labelledby="your-application">
        <div className="row-between">
          <h2 id="your-application" className="h2">
            Your application
          </h2>
          <span className={chipClass(status.tone)}>{status.label}</span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          {STATUS_HELP[application.status]}
        </p>
        {application.status === 'accepted' || application.status === 'confirmed' ? (
          <RsvpButtons eventId={event.id} status={application.status} />
        ) : null}
      </section>
    );
  }

  const opens = event.applications_open_at;
  return (
    <section className="raised card stack" aria-labelledby="apply">
      <h2 id="apply" className="h2">
        Apply
      </h2>
      {isOpen ? (
        <>
          <p className="muted small" style={{ margin: 0 }}>
            Applications close{' '}
            {event.applications_close_at
              ? formatDateTime(event.applications_close_at, zone)
              : 'soon'}
            .
          </p>
          {signedIn ? (
            <Link className="btn btn-primary btn-block" href={`/events/${event.slug}/apply`}>
              Apply now
            </Link>
          ) : (
            <Link
              className="btn btn-primary btn-block"
              href={`/sign-in?next=/events/${event.slug}/apply`}
            >
              Sign in to apply
            </Link>
          )}
        </>
      ) : opens && new Date(opens) > new Date() ? (
        <p className="muted small" style={{ margin: 0 }}>
          Applications open {formatDateTime(opens, zone)}.
        </p>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          Applications are closed.
        </p>
      )}
    </section>
  );
}

const STATUS_HELP: Record<MyApplication['status'], string> = {
  submitted: "We've got your application. You'll hear back by email.",
  accepted: "You're in. Confirm your place, or decline so someone on the waitlist can have it.",
  waitlisted: "You're on the waitlist. We'll email you if a place opens up.",
  rejected: "We couldn't offer you a place this time.",
  confirmed: "You're confirmed. Your ticket appears here before the event.",
  declined: 'You declined your place.',
};

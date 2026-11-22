import { applicationsOpen, formatInviteCode } from '@hx/core';
import {
  getEventSetup,
  getMyApplication,
  getMySubmission,
  getMyTeam,
  getSql,
  listAnnouncements,
  toEvent,
} from '@hx/db';
import { can, formatDateTime, formatTime, type Event, type MyApplication } from '@hx/shared';
import type { Metadata } from 'next';
import Link from '@/components/link';
import { CountdownBlocks } from '@/components/countdown';
import { AnnouncementFeed } from '@/components/live/announcements';
import { RsvpButtons } from '@/components/rsvp-buttons';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { loadEventForPage } from '@/lib/server/event-page';
import { qrSvg } from '@/lib/server/qr';
import { getViewer, headerProps } from '@/lib/server/viewer';
import { eventPhase } from '@/lib/ui/event-phase';
import { initials } from '@/lib/ui/initials';
import { APPLICATION_STATUS, chipClass, EVENT_MODE, SUBMISSION_STATUS } from '@/lib/ui/status';
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

/** The public event page (screens PDF pages 5 and 6): dark header band, tabs, framed apply box. */
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
  const confirmed = application?.status === 'confirmed' && viewer !== null;
  const [team, checkIn, qr] = confirmed
    ? await Promise.all([
        getMyTeam(sql, event.id, viewer.userId),
        sql<{ created_at: Date }[]>`
          select created_at from check_ins where event_id = ${event.id} and user_id = ${viewer.userId}
        `,
        application.ticket_code ? qrSvg(application.ticket_code) : Promise.resolve(null),
      ])
    : [null, [], null];
  const checkedInAt = checkIn[0]?.created_at.toISOString() ?? null;
  const submission = team && viewer ? await getMySubmission(sql, event.id, viewer.userId) : null;
  // Staff and confirmed participants follow announcements live (event:{id}:announcements).
  const announcements =
    (confirmed || access.roles.length > 0) &&
    (event.status === 'published' || event.status === 'live')
      ? await listAnnouncements(sql, event.id)
      : null;
  const isOpen = applicationsOpen({ ...event, deleted_at: null }, new Date());
  const phase = eventPhase(event);
  const serverNow = new Date().toISOString();
  const totalWeight = setup.rubric.reduce((sum, criterion) => sum + criterion.weight, 0);
  const sections = [
    { id: 'about', label: 'Overview', show: true },
    { id: 'schedule', label: 'Schedule', show: setup.schedule.length > 0 },
    { id: 'tracks', label: 'Tracks', show: setup.tracks.length > 0 },
    { id: 'judging', label: 'Judging', show: setup.rubric.length > 0 },
  ].filter((section) => section.show);

  return (
    <>
      <SiteHeader {...headerProps(viewer)} current="events" />
      <main>
        <section className="band-dark" aria-labelledby="event-title">
          <div className={`container ${styles.header}`}>
            <p className={styles.crumb}>
              <Link href="/events">Events</Link> / {event.name}
            </p>
            <p className="row" style={{ margin: 0 }}>
              <span className="eyebrow">
                <span className="brand-case">CIReN</span> hackathon
              </span>
              <span className={chipClass(phase.tone)}>{phase.label}</span>
            </p>
            <div className={styles.titleRow}>
              <h1 id="event-title" className={`display ${styles.title}`}>
                {event.name}
              </h1>
              {can(access.roles, 'event.view_staff') ? (
                <Link className="btn" href={`/organize/${event.id}`}>
                  Manage event
                </Link>
              ) : null}
            </div>
            <dl className={styles.facts}>
              <div>
                <dt>Dates</dt>
                <dd className="mono">
                  {formatDateTime(event.starts_at, zone)} – {formatDateTime(event.ends_at, zone)}
                </dd>
              </div>
              {event.location ? (
                <div>
                  <dt>Venue</dt>
                  <dd>{event.location}</dd>
                </div>
              ) : null}
              <div>
                <dt>Format</dt>
                <dd>{EVENT_MODE[event.mode]}</dd>
              </div>
              <div>
                <dt>Teams</dt>
                <dd>
                  {event.team_size_min === event.team_size_max
                    ? `${event.team_size_max} people`
                    : `${event.team_size_min} to ${event.team_size_max} people`}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <div className="band-white">
          <div className={`container ${styles.layout}`}>
            <div className={styles.main}>
              {sections.length > 1 ? (
                <nav className="tabs" aria-label="On this page">
                  {sections.map((section, index) => (
                    <a
                      key={section.id}
                      className="tab"
                      href={`#${section.id}`}
                      aria-current={index === 0 ? 'true' : undefined}
                    >
                      {section.label}
                    </a>
                  ))}
                </nav>
              ) : null}

              <section id="about" className={styles.section} aria-labelledby="about-title">
                <h2 id="about-title" className="h1">
                  About this event
                </h2>
                {event.description ? (
                  <p className={styles.description}>{event.description}</p>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>
                    {EVENT_MODE[event.mode]}
                    {event.location ? ` in ${event.location}` : ''}. Submissions close{' '}
                    {formatDateTime(event.submission_deadline, zone)}.
                  </p>
                )}
              </section>

              {announcements && viewer ? (
                <AnnouncementFeed eventId={event.id} initial={announcements} timezone={zone} />
              ) : null}

              {setup.schedule.length > 0 ? (
                <section id="schedule" className={styles.section} aria-labelledby="schedule-title">
                  <div className="row-between">
                    <h2 id="schedule-title" className="h1">
                      Schedule
                    </h2>
                    <span className="hint">
                      Times in {zone.replaceAll('_', ' ')}.{' '}
                      {viewer ? <Link href="/profile">Change</Link> : null}
                    </span>
                  </div>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th scope="col">Time</th>
                          <th scope="col">What happens</th>
                        </tr>
                      </thead>
                      <tbody>
                        {setup.schedule.map((item) => (
                          <tr key={item.id}>
                            <td className="mono small" style={{ whiteSpace: 'nowrap' }}>
                              {formatDateTime(item.starts_at, zone)}
                            </td>
                            <td>
                              {item.title}
                              {item.location ? (
                                <span className="muted small"> · {item.location}</span>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              {setup.tracks.length > 0 ? (
                <section id="tracks" className={styles.section} aria-labelledby="tracks-title">
                  <h2 id="tracks-title" className="h1">
                    Tracks
                  </h2>
                  <ol className={styles.tracks}>
                    {setup.tracks.map((track, index) => (
                      <li key={track.id}>
                        <span className="mono small muted">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <h3 className="h3">{track.name}</h3>
                        {track.description ? (
                          <p className="muted small">{track.description}</p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                  <p className="hint" style={{ margin: 0 }}>
                    A project can enter up to {event.max_tracks_per_submission}{' '}
                    {event.max_tracks_per_submission === 1 ? 'track' : 'tracks'}.
                  </p>
                </section>
              ) : null}

              {setup.rubric.length > 0 ? (
                <section id="judging" className={styles.section} aria-labelledby="judging-title">
                  <h2 id="judging-title" className="h1">
                    How projects are judged
                  </h2>
                  <p className="muted" style={{ margin: 0 }}>
                    Every project is scored against the same rubric. Scores are adjusted so that
                    harsh and generous judges count equally.
                  </p>
                  <ul className={styles.rubric}>
                    {setup.rubric.map((criterion) => (
                      <li key={criterion.id}>
                        <span>
                          <strong>{criterion.name}.</strong>{' '}
                          <span className="muted">{criterion.description}</span>
                        </span>
                        {totalWeight > 0 ? (
                          <span className="mono small muted">
                            {Math.round((criterion.weight / totalWeight) * 100)}%
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>

            <aside className={styles.aside}>
              {event.status === 'completed' ? (
                <section className="frame card stack" aria-labelledby="results-title">
                  <p className="eyebrow">Results are out</p>
                  <h2 id="results-title" className="h2">
                    See the winners and every project
                  </h2>
                  <Link
                    className="btn btn-primary btn-block"
                    href={`/events/${event.slug}/results`}
                  >
                    See the results
                  </Link>
                  <Link className="btn btn-block" href={`/events/${event.slug}/gallery`}>
                    Browse projects
                  </Link>
                </section>
              ) : null}
              <ApplicationCard
                event={event}
                application={application}
                signedIn={viewer !== null}
                isOpen={isOpen}
                zone={zone}
                serverNow={serverNow}
                featured={event.status !== 'completed'}
              />
              {submission ? (
                <section className="band-dark card stack" aria-labelledby="project-title">
                  <p className="eyebrow">
                    {event.submissions_locked_at === null
                      ? 'Submissions close in'
                      : 'Submissions are closed'}
                  </p>
                  {event.submissions_locked_at === null ? (
                    <CountdownBlocks deadline={event.submission_deadline} serverNow={serverNow} />
                  ) : null}
                  <p className="mono small muted" style={{ margin: 0 }}>
                    {formatDateTime(event.submission_deadline, zone)}
                  </p>
                  <div className="row-between">
                    <h2 id="project-title" className="h3">
                      {submission.title || 'Untitled draft'}
                    </h2>
                    <span className={chipClass(SUBMISSION_STATUS[submission.status].tone)}>
                      {SUBMISSION_STATUS[submission.status].label}
                    </span>
                  </div>
                  <Link
                    className="btn btn-primary btn-block"
                    href={`/events/${event.slug}/submission`}
                  >
                    {event.status === 'completed'
                      ? 'Judge feedback'
                      : submission.status === 'submitted'
                        ? 'View submission'
                        : 'Edit submission'}
                  </Link>
                </section>
              ) : null}
              {confirmed ? (
                <section className="panel card stack" aria-labelledby="team-title">
                  <span className="stack-sm" style={{ gap: 4 }}>
                    <span className="eyebrow eyebrow-muted">Your team</span>
                    <h2 id="team-title" className="h2">
                      {team ? team.name : 'No team yet'}
                    </h2>
                  </span>
                  {team ? (
                    <>
                      <div className="row" style={{ gap: 8 }}>
                        {team.members.map((member) => (
                          <span key={member.user_id} className="avatar" title={member.name}>
                            {initials(member.name)}
                          </span>
                        ))}
                        <span className="muted small" style={{ marginLeft: 4 }}>
                          {team.members.length} of {team.team_size_max}
                        </span>
                      </div>
                      <p className={`well ${styles.code}`}>
                        <span className="muted small">Invite code</span>
                        <span className="code">{formatInviteCode(team.invite_code)}</span>
                      </p>
                    </>
                  ) : (
                    <p className="muted small" style={{ margin: 0 }}>
                      Start a team, join one with an invite code, or find one on the team board.
                    </p>
                  )}
                  <Link
                    className={team ? 'btn btn-block' : 'btn btn-primary btn-block'}
                    href={`/events/${event.slug}/team`}
                  >
                    {team ? 'Manage team' : 'Find a team'}
                  </Link>
                </section>
              ) : null}
              {confirmed && qr && application.ticket_code ? (
                <section className="panel card stack" aria-labelledby="ticket-title">
                  <div className="row-between">
                    <h2 id="ticket-title" className="h2">
                      Your ticket
                    </h2>
                    {checkedInAt ? (
                      <span className={chipClass('success')}>
                        Checked in {formatTime(checkedInAt, zone)}
                      </span>
                    ) : null}
                  </div>
                  <div className={`well ${styles.qr}`} dangerouslySetInnerHTML={{ __html: qr }} />
                  <p className="muted small" style={{ margin: 0 }}>
                    Show this at the door. Turn your screen brightness up so it scans first time.
                  </p>
                  <Link className="btn btn-block" href={`/events/${event.slug}/ticket`}>
                    Open full screen
                  </Link>
                </section>
              ) : null}
              <section className="panel card stack-sm" aria-labelledby="dates-title">
                <h2 id="dates-title" className="eyebrow eyebrow-muted">
                  Key dates
                </h2>
                <dl className={`dl ${styles.dates}`}>
                  <div>
                    <dt>Starts</dt>
                    <dd className="mono small">{formatDateTime(event.starts_at, zone)}</dd>
                  </div>
                  <div>
                    <dt>Submissions close</dt>
                    <dd className="mono small">
                      {formatDateTime(event.submission_deadline, zone)}
                    </dd>
                  </div>
                  <div>
                    <dt>Ends</dt>
                    <dd className="mono small">{formatDateTime(event.ends_at, zone)}</dd>
                  </div>
                </dl>
                <p className="hint" style={{ margin: 0 }}>
                  Times shown in {zone.replaceAll('_', ' ')}.{' '}
                  {viewer ? <Link href="/profile">Change</Link> : null}
                </p>
              </section>
            </aside>
          </div>
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
  serverNow,
  featured,
}: {
  event: Event;
  application: MyApplication | null;
  signedIn: boolean;
  isOpen: boolean;
  zone: string;
  serverNow: string;
  /** The apply box is framed: it's the featured action on the page. */
  featured: boolean;
}) {
  const box = featured ? 'frame card stack' : 'panel card stack';
  if (application) {
    const status = APPLICATION_STATUS[application.status];
    return (
      <section className={box} aria-labelledby="your-application">
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
  const closes = event.applications_close_at;
  if (isOpen) {
    return (
      <section className={box} aria-labelledby="apply">
        <h2 id="apply" className="eyebrow">
          {closes ? 'Applications close in' : 'Applications are open'}
        </h2>
        {closes ? (
          <>
            <CountdownBlocks deadline={closes} serverNow={serverNow} />
            <p className="mono small muted" style={{ margin: 0 }}>
              {formatDateTime(closes, zone)}
            </p>
          </>
        ) : null}
        <Link
          className="btn btn-primary btn-block"
          href={
            signedIn ? `/events/${event.slug}/apply` : `/sign-in?next=/events/${event.slug}/apply`
          }
        >
          Apply now
        </Link>
        <p className="muted small" style={{ margin: 0 }}>
          {signedIn
            ? 'Takes about 5 minutes.'
            : 'Takes about 5 minutes. You sign in with Google or GitHub first.'}
        </p>
      </section>
    );
  }
  return (
    <section className="panel card stack-sm" aria-labelledby="apply">
      <h2 id="apply" className="eyebrow eyebrow-muted">
        Applications
      </h2>
      <p className="muted small" style={{ margin: 0 }}>
        {opens && new Date(opens) > new Date()
          ? `Applications open ${formatDateTime(opens, zone)}.`
          : 'Applications are closed.'}
      </p>
    </section>
  );
}

const STATUS_HELP: Record<MyApplication['status'], string> = {
  submitted: "We've got your application. You'll hear back by email.",
  accepted: "You're in. Confirm your place, or decline so someone on the waitlist can have it.",
  waitlisted: "You're on the waitlist. We'll email you if a place opens up.",
  rejected: "We couldn't offer you a place this time.",
  confirmed: "You're confirmed. Show your ticket at the door.",
  declined: 'You declined your place.',
};

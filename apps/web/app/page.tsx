import Link from 'next/link';
import { ArrowRightIcon, EnterIcon, LockIcon } from '@/components/icons';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { getSql, listPublicEvents, toEventSummary } from '@hx/db';
import { formatDate, formatDateTime } from '@hx/shared';
import { headerProps, getViewer } from '@/lib/server/viewer';
import { eventPhase } from '@/lib/ui/event-phase';
import { chipClass } from '@/lib/ui/status';
import styles from './page.module.css';

const STEPS = [
  {
    title: 'Apply',
    body: 'Answer a few questions. You hear back by email and in the app.',
  },
  {
    title: 'Team up',
    body: 'Start a team or join one with an invite code. Need people? Post on the team board.',
  },
  {
    title: 'Build and submit',
    body: 'Write up your project, add GitHub, YouTube or demo links, and keep editing until the deadline.',
  },
  {
    title: 'Get judged',
    body: 'Judges score every project against the same rubric. Winners get a badge on their profile.',
  },
];

const FEATURES = [
  { title: 'Applications', body: 'Custom questions, bulk decisions, emails with an undo window' },
  { title: 'Check-in', body: 'QR tickets scanned by volunteers on their phones' },
  {
    title: 'Judging',
    body: 'Rubrics, balanced judge assignment, scores adjusted for harsh and generous judges',
  },
  { title: 'Impact reports', body: 'Attendance, demographics and completion, ready for funders' },
];

export default async function HomePage() {
  const viewer = await getViewer();
  const events = (await listPublicEvents(getSql())).map(toEventSummary);
  const now = new Date();
  const upcoming = events.filter((e) => new Date(e.ends_at) >= now);
  const past = events.filter((e) => new Date(e.ends_at) < now);
  const next = upcoming[0];

  return (
    <>
      <SiteHeader {...headerProps(viewer)} />
      <main className="container">
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className="eyebrow">
              Hackathons by <span className="brand-case">CIReN</span>
            </p>
            <h1 className="display">
              Press Enter.
              <br />
              Build what&apos;s next.
            </h1>
            <p className={styles.lede}>
              Apply to CIReN hackathons, find your team, submit your project and get your results in
              one place, on the web or the Android app.
            </p>
            <div className={styles.actions}>
              <Link className="btn btn-primary btn-lg" href="#events">
                See upcoming events <ArrowRightIcon />
              </Link>
              <Link className="btn btn-lg" href="#how-it-works">
                How it works
              </Link>
            </div>
            <p className={styles.note}>
              <LockIcon width={14} height={14} />
              Sign in with Google or GitHub. No new password to remember.
            </p>
          </div>
          <div className={styles.keyWell} aria-hidden="true">
            <div className={styles.key}>
              <span>Enter</span>
              <EnterIcon className={styles.keyArrow} width={36} height={36} />
            </div>
          </div>
        </section>

        <section id="events" className={styles.section} aria-labelledby="events-title">
          <div>
            <p className="eyebrow">Events</p>
            <h2 id="events-title" className={styles.sectionTitle}>
              Upcoming hackathons
            </h2>
          </div>
          <div className={styles.events}>
            {next ? (
              <article className={`raised ${styles.nextEvent}`}>
                <div className="row-between">
                  <span className={chipClass(eventPhase(next, now).tone)}>
                    {eventPhase(next, now).label}
                  </span>
                  <span className="muted small">
                    {formatDateTime(next.starts_at, viewer?.timezone ?? next.timezone)}
                  </span>
                </div>
                <h3 className={styles.eventName}>{next.name}</h3>
                <p className="muted" style={{ margin: 0 }}>
                  {next.location ?? 'Location to be announced'}
                  {upcoming.length > 1 ? ` · and ${upcoming.length - 1} more coming up` : ''}
                </p>
                <div>
                  <Link className="btn" href={`/events/${next.slug}`}>
                    View event
                  </Link>
                </div>
              </article>
            ) : (
              <article className={`raised ${styles.nextEvent}`}>
                <span className={chipClass('info')}>Coming soon</span>
                <h3 className={styles.eventName}>The next CIReN hackathon</h3>
                <p className="muted" style={{ margin: 0 }}>
                  Dates, tracks and prizes appear here once organizers publish them.
                </p>
              </article>
            )}
            <aside className={`raised ${styles.pastEvents}`} aria-labelledby="past-title">
              <h3 id="past-title" className="h2" style={{ fontSize: 16 }}>
                Past CIReN events
              </h3>
              {past.length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>
                  Past events will be listed here.
                </p>
              ) : (
                <ul>
                  {past.slice(0, 8).map((event) => (
                    <li key={event.id}>
                      <Link href={`/events/${event.slug}`}>{event.name}</Link>
                      <span className="mono small muted">
                        {formatDate(event.starts_at, viewer?.timezone ?? event.timezone)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        </section>

        <section id="how-it-works" className={styles.section} aria-labelledby="how-title">
          <div>
            <p className="eyebrow">How it works</p>
            <h2 id="how-title" className={styles.sectionTitle}>
              From application to badge
            </h2>
          </div>
          <ol className={styles.steps}>
            {STEPS.map((step, index) => (
              <li key={step.title} className={`raised ${styles.step}`}>
                <span className={styles.stepNumber}>{index + 1}</span>
                <h3 className="h2">{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="for-organizers" className={styles.section} aria-labelledby="org-title">
          <div className={`raised ${styles.organizers}`}>
            <div className={styles.organizerCopy}>
              <p className="eyebrow">For organizers</p>
              <h2 id="org-title" className={styles.sectionTitle}>
                Run the whole event from one dashboard.
              </h2>
              <p>Built for CIReN first. Other campus clubs can run their events on it later.</p>
              <a className="btn" href="mailto:admin.cirenet@gmail.com">
                Contact CIReN
              </a>
            </div>
            <div className={styles.features}>
              {FEATURES.map((feature) => (
                <div key={feature.title} className={`raised ${styles.feature}`}>
                  <strong>{feature.title}</strong>
                  <span>{feature.body}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

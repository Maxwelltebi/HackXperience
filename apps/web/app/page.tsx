import Image from 'next/image';
import Link from '@/components/link';
import { ArrowRightIcon, LockIcon } from '@/components/icons';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { getSql, listPublicEvents, toEventSummary } from '@hx/db';
import { formatDate, type EventSummary } from '@hx/shared';
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
    body: 'Start a team or join one with an invite code. If you need teammates, post on the team board.',
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
  {
    title: 'Applications',
    body: 'Write your own application questions, accept or reject in bulk, and undo a decision within 10 minutes before the email goes out.',
  },
  {
    title: 'Check-in',
    body: "Volunteers scan each participant's QR ticket with their phones.",
  },
  {
    title: 'Judging',
    body: 'Every project gets the same number of judges. Scores are adjusted so strict and lenient judges count the same.',
  },
  {
    title: 'Impact reports',
    body: 'Attendance, demographics and completion rates that you can send to sponsors.',
  },
];

export default async function HomePage() {
  const viewer = await getViewer();
  const events = (await listPublicEvents(getSql())).map(toEventSummary);
  const now = new Date();
  const upcoming = events.filter((e) => new Date(e.ends_at) >= now);
  const past = events.filter((e) => new Date(e.ends_at) < now);
  const next = upcoming[0];
  const zone = (event: EventSummary) => viewer?.timezone ?? event.timezone;

  return (
    <>
      <SiteHeader {...headerProps(viewer)} signInPrimary />
      <main>
        <section className="band band-hero" aria-labelledby="hero-title">
          <div className={`container ${styles.heroGrid}`}>
            <div className={styles.heroCopy}>
              <p className="eyebrow">
                Hackathons by <span className="brand-case">CIReN</span>
              </p>
              <h1 id="hero-title" className="display">
                Apply to CIReN hackathons and submit your project here.
              </h1>
              <p className={styles.lede}>
                HackXperience is CIReN&apos;s hackathon platform. You apply, join a team, submit
                your project and see your results here.
              </p>
              <div className={styles.actions}>
                <Link className="btn btn-primary btn-lg" href="/events">
                  See upcoming events
                </Link>
                <Link className="btn btn-lg btn-arrow" href="#how-to-participate">
                  See the 4 steps
                  <span className="btn-arrow-box">
                    <ArrowRightIcon />
                  </span>
                </Link>
              </div>
              <p className={styles.note}>
                <LockIcon width={14} height={14} className="x" />
                Sign in with Google or GitHub. No new password to remember.
              </p>
            </div>
            <div className={`frame ${styles.heroImage}`}>
              <Image
                src="/images/hero-enter-key.jpg"
                alt="A person walks through an open door in the Enter key of a large keyboard."
                width={1070}
                height={1004}
                sizes="(min-width: 960px) 480px, 100vw"
                priority
              />
            </div>
          </div>
        </section>

        {next ? <NextEventBand event={next} zone={zone(next)} now={now} /> : null}

        {past.length > 0 ? (
          <section className="band band-white" aria-labelledby="past-title">
            <div className="container stack">
              <div className={styles.sectionHead}>
                <div>
                  <p className="eyebrow">
                    Past <span className="brand-case">CIReN</span> events
                  </p>
                  <h2 id="past-title" className="h1">
                    Events CIReN has run
                  </h2>
                </div>
                <a className="text-link" href="https://ciren.network">
                  See all event photos on ciren.network
                </a>
              </div>
              <ul className={styles.pastEvents}>
                {past.slice(0, 6).map((event) => (
                  <li key={event.id} className={`frame ${styles.pastCard}`}>
                    <p className="eyebrow eyebrow-muted">Hackathon</p>
                    <h3 className="h3">{event.name}</h3>
                    <p className="mono small muted" style={{ margin: 0 }}>
                      {formatDate(event.starts_at, zone(event))}
                      {event.location ? ` · ${event.location}` : ''}
                    </p>
                    <Link className="text-link small" href={`/events/${event.slug}/gallery`}>
                      See the projects
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        <section id="how-to-participate" className="band band-tint" aria-labelledby="how-title">
          <div className="container stack">
            <div>
              <p className="eyebrow">How to participate</p>
              <h2 id="how-title" className="h1">
                Apply, team up, submit, get judged
              </h2>
              <p className="muted" style={{ margin: '8px 0 0' }}>
                You do all four steps with one account.
              </p>
            </div>
            <ol className={styles.ruled}>
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <span className="mono small muted">{String(index + 1).padStart(2, '0')}</span>
                  <h3 className="h3">{step.title}</h3>
                  <p className="muted small">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="for-organizers" className="band band-white" aria-labelledby="org-title">
          <div className={`container ${styles.organizers}`}>
            <div className="stack">
              <p className="eyebrow eyebrow-muted">For organizers</p>
              <h2 id="org-title" className="h1">
                Organizers manage the event from one dashboard.
              </h2>
              <p className="muted" style={{ margin: 0 }}>
                CIReN uses it for its own hackathons now. Other campus clubs will be able to use it
                later.
              </p>
              <div>
                <a className="btn" href="mailto:admin.cirenet@gmail.com">
                  Contact CIReN
                </a>
              </div>
            </div>
            <ul className={`${styles.ruled} ${styles.features}`}>
              {FEATURES.map((feature) => (
                <li key={feature.title}>
                  <h3 className="h3">{feature.title}</h3>
                  <p className="muted small">{feature.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {viewer ? null : (
          <section className="band band-mint" aria-labelledby="start-title">
            <div className={`container ${styles.getStarted}`}>
              <div>
                <p className="eyebrow">Get started</p>
                <h2 id="start-title" className="h1">
                  Create your account before applications open.
                </h2>
              </div>
              <Link className="btn btn-primary btn-lg" href="/sign-in">
                Sign in
              </Link>
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

/** The one dark band on the homepage: the next event and its key dates. */
function NextEventBand({ event, zone, now }: { event: EventSummary; zone: string; now: Date }) {
  const phase = eventPhase(event, now);
  const dates: { label: string; at: string; extra?: string | null }[] = [];
  if (event.applications_open_at) {
    dates.push({ label: 'Applications open', at: event.applications_open_at });
  }
  if (event.applications_close_at) {
    dates.push({ label: 'Applications close', at: event.applications_close_at });
  }
  dates.push({ label: 'Hacking starts', at: event.starts_at, extra: event.location });
  dates.push({ label: 'Event ends', at: event.ends_at });

  return (
    <section className="band band-dark" aria-labelledby="next-title">
      <div className={`container ${styles.nextGrid}`}>
        <div className="stack">
          <p className="row" style={{ margin: 0 }}>
            <span className="eyebrow">Next event</span>
            <span className={chipClass(phase.tone)}>{phase.label}</span>
          </p>
          <h2 id="next-title" className="h1">
            {event.name}
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            {phaseSentence(event, phase.label, zone)}
          </p>
          <div className="row">
            <Link className="btn btn-primary" href={`/events/${event.slug}`}>
              View event
            </Link>
          </div>
        </div>
        <ol className={styles.timeline}>
          {dates.map((row, index) => (
            <li key={row.label}>
              <span className={`mono ${styles.timelineNumber}`}>
                {String(index + 1).padStart(2, '0')}
              </span>
              <span>{row.label}</span>
              <span className="mono">
                {formatDate(row.at, zone)}
                {row.extra ? ` · ${row.extra}` : ''}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function phaseSentence(event: EventSummary, phase: string, zone: string): string {
  if (phase === 'Applications open' && event.applications_close_at) {
    return `Applications are open until ${formatDate(event.applications_close_at, zone)}.`;
  }
  if (phase === 'Upcoming' && event.applications_open_at) {
    return `Applications open on ${formatDate(event.applications_open_at, zone)}. Sign in now and you can apply as soon as they do.`;
  }
  if (phase === 'Live now') return 'The event is running now.';
  return `Hacking starts on ${formatDate(event.starts_at, zone)}.`;
}

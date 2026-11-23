import { getPlatformCounts, getSql, getTickHealth, type TickHealth } from '@hx/db';
import { EVENT_STATUSES, formatDateTime } from '@hx/shared';
import Link from '@/components/link';
import { outboxDeps } from '@/lib/server/ses';
import { getViewer } from '@/lib/server/viewer';
import { chipClass, EVENT_STATUS, type Tone } from '@/lib/ui/status';

interface Check {
  name: string;
  state: string;
  tone: Tone;
  detail: string;
}

function tickCheck(tick: TickHealth, secretSet: boolean, zone: string): Check {
  const name = 'Per-minute tick';
  if (!secretSet) {
    return {
      name,
      state: 'Not set up',
      tone: 'danger',
      detail:
        "TICK_SECRET isn't set in Vercel. Without the tick, deadlines don't lock and no emails are queued or sent.",
    };
  }
  if (tick.state === 'unavailable') {
    return {
      name,
      state: 'Unknown',
      tone: 'muted',
      detail: "This database has no pg_cron, so the tick can't be checked here.",
    };
  }
  if (tick.state === 'not_set_up') {
    return {
      name,
      state: 'Not set up',
      tone: 'danger',
      detail:
        'The Vault has no hx_tick_url or hx_tick_secret, so pg_cron calls nothing. Deadlines don\'t lock and no emails are queued or sent. See "Paused: wrap-up list" in docs/PROGRESS.md.',
    };
  }
  if (tick.lastStatus === 200) {
    return {
      name,
      state: 'Running',
      tone: 'success',
      detail: `Last call ${tick.lastCallAt ? formatDateTime(tick.lastCallAt, zone) : 'recently'}.`,
    };
  }
  return {
    name,
    state: tick.lastStatus === null ? 'No answer yet' : `Error ${tick.lastStatus}`,
    tone: 'warning',
    detail:
      tick.lastStatus === 401
        ? "The tick secret in the Vault doesn't match TICK_SECRET in Vercel."
        : 'Set up, but the latest call to /api/internal/tick did not succeed.',
  };
}

/** Overview (R43): the numbers that matter and whether the moving parts are set up. */
export default async function AdminOverviewPage() {
  const viewer = await getViewer();
  const zone = viewer?.timezone ?? 'UTC';
  const sql = getSql();
  const [counts, tick] = await Promise.all([getPlatformCounts(sql), getTickHealth(sql)]);
  const running = counts.events.live + counts.events.judging;
  const sesReady = outboxDeps() !== null;

  const checks: Check[] = [
    tickCheck(tick, Boolean(process.env.TICK_SECRET), zone),
    sesReady
      ? { name: 'Email (AWS SES)', state: 'Set up', tone: 'success', detail: 'Emails are sent.' }
      : {
          name: 'Email (AWS SES)',
          state: 'Not set up',
          tone: 'warning',
          detail: `Emails wait in the queue until it is. ${counts.emails.pending} waiting now.`,
        },
    counts.emails.failed > 0
      ? {
          name: 'Failed emails',
          state: `${counts.emails.failed} failed`,
          tone: 'danger',
          detail: 'Gave up after 5 attempts. The reason is in notification_outbox.last_error.',
        }
      : { name: 'Failed emails', state: 'None', tone: 'success', detail: 'No email has failed.' },
    process.env.GITHUB_TOKEN
      ? {
          name: 'GitHub token',
          state: 'Set',
          tone: 'success',
          detail: 'Commit and privacy checks use it.',
        }
      : {
          name: 'GitHub token',
          state: 'Not set',
          tone: 'warning',
          detail: 'GitHub allows 60 checks an hour without it. Set GITHUB_TOKEN before launch.',
        },
    process.env.SUPABASE_SERVICE_ROLE_KEY
      ? {
          name: 'Project images',
          state: 'Set up',
          tone: 'success',
          detail: 'Teams can upload images.',
        }
      : {
          name: 'Project images',
          state: 'Not set up',
          tone: 'warning',
          detail: 'SUPABASE_SERVICE_ROLE_KEY is missing, so image uploads are off.',
        },
  ];

  return (
    <div className="stack">
      <div className="stat-strip stat-strip-lead">
        <section className="band-dark stat" aria-labelledby="running">
          <h2 id="running" className="eyebrow">
            Running now
          </h2>
          <span className="stat-value">{running}</span>
          <span className="small muted">
            {running === 1 ? 'event is live or in judging' : 'events live or in judging'}
          </span>
        </section>
        <section className="panel stat" aria-labelledby="accounts">
          <h2 id="accounts" className="eyebrow eyebrow-muted">
            Accounts
          </h2>
          <span className="stat-value">{counts.accounts}</span>
          <span className="small muted">
            {counts.organizers} {counts.organizers === 1 ? 'organizer' : 'organizers'},{' '}
            {counts.admins} platform {counts.admins === 1 ? 'admin' : 'admins'}
          </span>
        </section>
        <section className="panel stat" aria-labelledby="subscribers">
          <h2 id="subscribers" className="eyebrow eyebrow-muted">
            Alert subscribers
          </h2>
          <span className="stat-value">{counts.alertSubscribers}</span>
          <span className="small muted">get event alert emails</span>
        </section>
      </div>

      <section className="panel card stack-sm" aria-labelledby="events-title">
        <div className="row-between">
          <h2 id="events-title" className="h2">
            Events
          </h2>
          <Link href="/admin/events">See every event</Link>
        </div>
        <ul className="row" style={{ listStyle: 'none', margin: 0, padding: 0, flexWrap: 'wrap' }}>
          {EVENT_STATUSES.map((status) => (
            <li key={status} className="row" style={{ gap: 8 }}>
              <span className={chipClass(EVENT_STATUS[status].tone)}>
                {EVENT_STATUS[status].label}
              </span>
              <span className="mono">{counts.events[status]}</span>
            </li>
          ))}
          {counts.deletedEvents > 0 ? (
            <li className="row" style={{ gap: 8 }}>
              <span className="chip chip-danger">Deleted</span>
              <span className="mono">{counts.deletedEvents}</span>
            </li>
          ) : null}
        </ul>
      </section>

      <section className="panel table-wrap" aria-labelledby="health-title">
        <h2 id="health-title" className="h2" style={{ padding: '20px 24px 8px' }}>
          System health
        </h2>
        <table className="table">
          <thead>
            <tr>
              <th>Part</th>
              <th>State</th>
              <th>What it means</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((check) => (
              <tr key={check.name}>
                <td>
                  <strong>{check.name}</strong>
                </td>
                <td>
                  <span className={chipClass(check.tone)}>{check.state}</span>
                </td>
                <td className="small">{check.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

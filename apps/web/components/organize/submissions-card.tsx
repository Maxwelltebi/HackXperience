'use client';

import {
  formatDateTime,
  utcToZoned,
  zonedToUtc,
  type ReopenSubmissionsResult,
  type SubmissionCounts,
} from '@hx/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/client/api';
import { Countdown } from '../countdown';
import { AlertIcon, CheckIcon } from '../icons';
import { Field } from './event-form';

interface Props {
  eventId: string;
  counts: SubmissionCounts;
  deadline: string;
  lockedAt: string | null;
  /** The event's time zone: the reopen form takes a local time there. */
  timezone: string;
  serverNow: string;
  /** Owner, and the event is published or live. */
  canReopen: boolean;
}

/** Organizer overview: submission counts, deadline state, and reopen after an outage. */
export function SubmissionsCard(props: Props) {
  const { eventId, counts, deadline, lockedAt, timezone, serverNow, canReopen } = props;
  const router = useRouter();
  const passed = Date.parse(serverNow) >= Date.parse(deadline);
  const closed = lockedAt !== null || passed;
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState(() =>
    utcToZoned(new Date(Date.parse(serverNow) + 30 * 60_000).toISOString(), timezone),
  );
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reopen(e: FormEvent) {
    e.preventDefault();
    let utc: string;
    try {
      utc = zonedToUtc(when, timezone);
    } catch {
      setError('Pick a date and time.');
      return;
    }
    setBusy(true);
    const result = await api<ReopenSubmissionsResult>(`/events/${eventId}/submissions/reopen`, {
      method: 'POST',
      body: { submission_deadline: utc },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.fields.submission_deadline ?? result.message);
      return;
    }
    setError(undefined);
    setOpen(false);
    setNotice(
      `Submissions reopened until ${formatDateTime(result.data.submission_deadline, timezone)}.`,
    );
    router.refresh();
  }

  return (
    <section className="panel card stack" aria-labelledby="submissions-title">
      <div className="row-between">
        <h2 id="submissions-title" className="h2">
          Submissions
        </h2>
        <span className={`chip chip-${closed ? 'muted' : 'success'}`}>
          {lockedAt ? 'Locked' : passed ? 'Locking' : 'Open'}
        </span>
      </div>
      {notice ? (
        <p className="banner banner-success" role="status" style={{ margin: 0 }}>
          <CheckIcon /> {notice}
        </p>
      ) : null}
      <dl className="dl">
        <dt>Submitted</dt>
        <dd className="mono">{counts.submitted}</dd>
        <dt>Drafts</dt>
        <dd className="mono">{counts.drafts}</dd>
        <dt>Teams</dt>
        <dd className="mono">{counts.teams}</dd>
        <dt>{closed ? 'Deadline was' : 'Closes in'}</dt>
        <dd className="small">
          {closed ? (
            formatDateTime(deadline, timezone)
          ) : (
            <Countdown
              deadline={deadline}
              serverNow={serverNow}
              onExpire={() => router.refresh()}
            />
          )}
        </dd>
        {lockedAt ? (
          <>
            <dt>Locked at</dt>
            <dd className="small mono">{formatDateTime(lockedAt, timezone)}</dd>
          </>
        ) : null}
      </dl>
      {passed && !lockedAt ? (
        <p className="muted small" style={{ margin: 0 }}>
          The deadline has passed, so saving is already refused. Drafts are auto-submitted within a
          minute.
        </p>
      ) : null}
      {canReopen && closed ? (
        open ? (
          <form className="stack-sm" onSubmit={reopen}>
            <Field
              label={`New deadline (${timezone})`}
              error={error}
              hint="Teams can edit and submit again until then. Use this after an outage."
            >
              {(p) => (
                <input
                  {...p}
                  className="input"
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  required
                />
              )}
            </Field>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'Reopening…' : 'Reopen submissions'}
              </button>
              <button className="btn" type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button className="btn" type="button" onClick={() => setOpen(true)}>
            <AlertIcon /> Reopen submissions
          </button>
        )
      ) : null}
    </section>
  );
}

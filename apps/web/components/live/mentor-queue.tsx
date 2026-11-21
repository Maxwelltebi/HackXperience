'use client';

import { liveTopics, type MentorRequest, type MentorRequestList } from '@hx/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/client/api';
import { useLiveChannel } from '@/lib/client/use-live-channel';
import { AlertIcon, CheckIcon } from '../icons';
import { Busy } from '@/components/loading-state';

const STATUS_TONE = {
  open: 'warning',
  claimed: 'info',
  resolved: 'success',
  cancelled: 'muted',
} as const;
const STATUS_LABEL = {
  open: 'Waiting',
  claimed: 'Mentor on it',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
};

/** "3 min ago", from the server-sent time and the device clock (approximate is fine here). */
function ago(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`;
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

/** The mentor queue: open requests oldest first, live on event:{id}:mentors. */
export function MentorQueue({
  eventId,
  viewerId,
  canClaim,
  initial,
}: {
  eventId: string;
  viewerId: string;
  canClaim: boolean;
  initial: MentorRequestList;
}) {
  const [items, setItems] = useState(initial.items);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const now = useNow();

  const refetch = useCallback(async () => {
    const result = await api<MentorRequestList>(`/events/${eventId}/mentor-requests`);
    if (!result.ok) return null;
    setItems(result.data.items);
    return result.data.version;
  }, [eventId]);
  useLiveChannel(liveTopics.mentors(eventId), refetch);

  async function act(id: string, action: 'claim' | 'resolve') {
    setBusy(id);
    const result = await api<MentorRequest>(`/mentor-requests/${id}/${action}`, { method: 'POST' });
    setError(result.ok ? null : result.message);
    await refetch();
    setBusy(null);
  }

  const active = items.filter((r) => r.status === 'open' || r.status === 'claimed');
  const done = items
    .filter((r) => r.status === 'resolved' || r.status === 'cancelled')
    .slice(-10)
    .reverse();

  return (
    <div className="stack">
      {error ? (
        <p className="banner banner-danger" role="alert" style={{ margin: 0 }}>
          <AlertIcon /> {error}
        </p>
      ) : null}
      <section className="panel card stack" aria-labelledby="queue-title">
        <div className="row-between">
          <h2 id="queue-title" className="h2">
            Waiting for help
          </h2>
          <span className="mono">{items.filter((r) => r.status === 'open').length} open</span>
        </div>
        {active.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No one is waiting. New requests appear here without a refresh.
          </p>
        ) : (
          active.map((r) => (
            <article key={r.id} className="well card-tight stack-sm">
              <div className="row-between" style={{ gap: 12 }}>
                <strong>{r.topic}</strong>
                <span className={`chip chip-${STATUS_TONE[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
              {r.description ? (
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.description}</p>
              ) : null}
              <span className="muted small">
                {r.team_name} · {r.requested_by_name} ·{' '}
                <span className="mono">{ago(r.created_at, now)}</span>
                {r.claimed_by_name ? ` · ${r.claimed_by_name}` : ''}
              </span>
              {canClaim && r.status === 'open' ? (
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => act(r.id, 'claim')}
                >
                  {busy === r.id ? <Busy>Claiming…</Busy> : "I'll take it"}
                </button>
              ) : null}
              {r.status === 'claimed' && r.claimed_by === viewerId ? (
                <button
                  className="btn btn-sm"
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => act(r.id, 'resolve')}
                >
                  {busy === r.id ? (
                    <Busy>Resolving…</Busy>
                  ) : (
                    <>
                      <CheckIcon /> Mark resolved
                    </>
                  )}
                </button>
              ) : null}
            </article>
          ))
        )}
      </section>
      {done.length > 0 ? (
        <section className="panel card stack-sm" aria-label="Recently closed">
          <h2 className="h2" style={{ fontSize: 18 }}>
            Recently closed
          </h2>
          {done.map((r) => (
            <span key={r.id} className="small">
              {r.topic}{' '}
              <span className="muted">
                · {r.team_name} · {STATUS_LABEL[r.status]}
              </span>
            </span>
          ))}
        </section>
      ) : null}
    </div>
  );
}

/** A team's "ask a mentor" form and its requests, live on team:{id}. */
export function TeamMentorPanel({
  eventId,
  teamId,
  live,
  initial,
}: {
  eventId: string;
  teamId: string;
  /** Mentor requests are taken only while the event is live. */
  live: boolean;
  initial: MentorRequestList;
}) {
  const [items, setItems] = useState(initial.items);
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const result = await api<MentorRequestList>(`/events/${eventId}/teams/me/mentor-requests`);
    if (!result.ok) return null;
    setItems(result.data.items);
    return result.data.version;
  }, [eventId]);
  // Team channel hints also cover saves and members; only mentor hints matter here.
  useLiveChannel(
    liveTopics.team(teamId),
    refetch,
    (hint) => !hint.type.startsWith('mentor_request.'),
  );

  async function ask(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await api<MentorRequest>(`/events/${eventId}/mentor-requests`, {
      method: 'POST',
      body: { id: crypto.randomUUID(), topic, description },
    });
    if (!result.ok) {
      setBusy(false);
      return setNotice({ tone: 'danger', text: result.message });
    }
    setTopic('');
    setDescription('');
    setNotice({ tone: 'success', text: 'Sent. A mentor will come to you.' });
    await refetch();
    setBusy(false);
  }

  async function cancel(id: string) {
    setCancelling(id);
    const result = await api(`/mentor-requests/${id}/cancel`, { method: 'POST' });
    if (!result.ok) setNotice({ tone: 'danger', text: result.message });
    await refetch();
    setCancelling(null);
  }

  return (
    <section className="panel card stack" aria-labelledby="mentor-title">
      <h2 id="mentor-title" className="h2">
        Ask a mentor
      </h2>
      {notice ? (
        <p className={`banner banner-${notice.tone}`} role="status" style={{ margin: 0 }}>
          {notice.tone === 'success' ? <CheckIcon /> : <AlertIcon />} {notice.text}
        </p>
      ) : null}
      {live ? (
        <form className="stack-sm" onSubmit={ask}>
          <label className="field">
            <span className="label">What are you stuck on?</span>
            <input
              className="input"
              required
              maxLength={120}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">Details (optional)</span>
            <textarea
              className="textarea"
              rows={2}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? <Busy>Sending…</Busy> : 'Ask for help'}
          </button>
        </form>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          Mentors take requests while the event is live.
        </p>
      )}
      {items.map((r) => (
        <div key={r.id} className="well card-tight row-between" style={{ gap: 12 }}>
          <span>
            <strong>{r.topic}</strong>
            <span className="muted small" style={{ display: 'block' }}>
              {r.claimed_by_name && r.status === 'claimed'
                ? `${r.claimed_by_name} is on the way`
                : STATUS_LABEL[r.status]}
            </span>
          </span>
          {r.status === 'open' || r.status === 'claimed' ? (
            <button
              className="btn btn-sm"
              type="button"
              disabled={cancelling !== null}
              onClick={() => void cancel(r.id)}
            >
              {cancelling === r.id ? <Busy>Cancelling…</Busy> : 'Cancel'}
            </button>
          ) : (
            <span className={`chip chip-${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
          )}
        </div>
      ))}
    </section>
  );
}

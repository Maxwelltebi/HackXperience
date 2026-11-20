'use client';

import { EVENT_TRANSITIONS } from '@hx/core';
import type { Event, EventStatus } from '@hx/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { chipClass, EVENT_STATUS } from '@/lib/ui/status';
import { AlertIcon } from '../icons';

const ACTIONS: Record<EventStatus, { label: string; confirm?: string; primary?: boolean }> = {
  draft: { label: 'Back to draft', confirm: 'Hide the event from the public again?' },
  published: { label: 'Publish', primary: true },
  live: { label: 'Go live', primary: true, confirm: 'Start the event? This can’t be undone.' },
  judging: {
    label: 'Start judging',
    primary: true,
    confirm: 'Close the event and start judging? This can’t be undone.',
  },
  completed: {
    label: 'Mark completed',
    primary: true,
    confirm: 'Mark the event completed? This can’t be undone.',
  },
};

const HELP: Record<EventStatus, string> = {
  draft: 'Only owners and admins can see it. Publish to open the event page and applications.',
  published: 'The event page is public. People can apply while the application window is open.',
  live: 'The event is running.',
  judging: 'Judges are scoring projects.',
  completed: 'Results are final.',
};

/** The event's status and the changes the state machine allows from it. */
export function StatusCard({ event, canEdit }: { event: Event; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<EventStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = EVENT_STATUS[event.status];
  const next = EVENT_TRANSITIONS[event.status];

  async function change(to: EventStatus) {
    const action = ACTIONS[to];
    if (action.confirm && !window.confirm(action.confirm)) return;
    setBusy(to);
    setError(null);
    const result = await api<Event>(`/events/${event.id}/status`, {
      method: 'POST',
      body: { status: to },
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  }

  return (
    <section className="raised card stack" aria-labelledby="status-title">
      <div className="row-between">
        <h2 id="status-title" className="h2">
          Status
        </h2>
        <span className={chipClass(status.tone)}>{status.label}</span>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        {HELP[event.status]}
      </p>
      {canEdit && next.length > 0 ? (
        <div className="row">
          {next.map((to) => (
            <button
              key={to}
              type="button"
              className={ACTIONS[to].primary ? 'btn btn-primary' : 'btn'}
              disabled={busy !== null}
              onClick={() => void change(to)}
            >
              {busy === to ? 'Working…' : ACTIONS[to].label}
            </button>
          ))}
        </div>
      ) : null}
      {error ? (
        <p className="banner banner-danger" role="alert" style={{ margin: 0 }}>
          <AlertIcon /> {error}
        </p>
      ) : null}
    </section>
  );
}

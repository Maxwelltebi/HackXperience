'use client';

import type { MyApplication } from '@hx/shared';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { AlertIcon } from './icons';
import { Busy } from '@/components/loading-state';
import { useRouterTransition } from '@/lib/client/use-router-transition';

/** Confirm or decline an accepted place. Declining a confirmed place asks first. */
export function RsvpButtons({
  eventId,
  status,
}: {
  eventId: string;
  status: 'accepted' | 'confirmed';
}) {
  const navigate = useRouterTransition();
  const [busy, setBusy] = useState<'confirm' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(response: 'confirm' | 'decline') {
    if (
      response === 'decline' &&
      !window.confirm(
        'Give up your place? Someone on the waitlist may take it, and you can’t undo this.',
      )
    ) {
      return;
    }
    setBusy(response);
    setError(null);
    const result = await api<MyApplication>(`/events/${eventId}/applications/me/rsvp`, {
      method: 'POST',
      body: { response },
    });
    if (!result.ok) {
      setBusy(null);
      setError(result.message);
      return;
    }
    navigate.refresh(() => setBusy(null));
  }

  return (
    <div className="stack-sm">
      {status === 'accepted' ? (
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy !== null}
          onClick={() => void send('confirm')}
        >
          {busy === 'confirm' ? <Busy>Confirming…</Busy> : 'Confirm my place'}
        </button>
      ) : null}
      <button
        type="button"
        className="btn btn-danger btn-block"
        disabled={busy !== null}
        onClick={() => void send('decline')}
      >
        {busy === 'decline' ? (
          <Busy>Declining…</Busy>
        ) : status === 'accepted' ? (
          'Decline'
        ) : (
          'I can’t come any more'
        )}
      </button>
      {error ? (
        <p className="banner banner-danger" role="alert" style={{ margin: 0 }}>
          <AlertIcon /> {error}
        </p>
      ) : null}
    </div>
  );
}

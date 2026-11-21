'use client';

import { useState } from 'react';
import { api } from '@/lib/client/api';
import { AlertIcon } from '../icons';
import { useRouterTransition } from '@/lib/client/use-router-transition';
import { Busy } from '@/components/loading-state';

/** Owner-only: soft-delete the event (restorable from Organize). */
export function DeleteEventButton({ eventId, name }: { eventId: string; name: string }) {
  const navigate = useRouterTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function remove() {
    if (
      !window.confirm(
        `Delete ${name}? It disappears for everyone. You can restore it from Organize.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    const result = await api(`/events/${eventId}`, { method: 'DELETE' });
    if (!result.ok) {
      setBusy(false);
      return setError(result.message);
    }
    navigate.push('/organize', () => setBusy(false));
  }
  return (
    <div className="stack-sm">
      <button
        className="btn btn-danger"
        type="button"
        disabled={busy || navigate.pending}
        onClick={remove}
      >
        {busy || navigate.pending ? <Busy>Deleting…</Busy> : 'Delete event'}
      </button>
      {error ? (
        <p className="field-error" role="alert">
          <AlertIcon /> {error}
        </p>
      ) : null}
    </div>
  );
}

/** Restore a deleted event from the Organize list. */
export function RestoreEventButton({ eventId }: { eventId: string }) {
  const navigate = useRouterTransition();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-sm"
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await api(`/events/${eventId}/restore`, { method: 'POST' });
        navigate.refresh(() => setBusy(false));
      }}
    >
      {busy ? <Busy>Restoring…</Busy> : 'Restore'}
    </button>
  );
}

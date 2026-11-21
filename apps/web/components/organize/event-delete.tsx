'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { AlertIcon } from '../icons';

/** Owner-only: soft-delete the event (restorable from Organize). */
export function DeleteEventButton({ eventId, name }: { eventId: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function remove() {
    if (
      !window.confirm(
        `Delete ${name}? It disappears for everyone. You can restore it from Organize.`,
      )
    )
      return;
    const result = await api(`/events/${eventId}`, { method: 'DELETE' });
    if (!result.ok) return setError(result.message);
    router.push('/organize');
    router.refresh();
  }
  return (
    <div className="stack-sm">
      <button className="btn btn-danger" type="button" onClick={remove}>
        Delete event
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
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-sm"
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await api(`/events/${eventId}/restore`, { method: 'POST' });
        setBusy(false);
        router.refresh();
      }}
    >
      Restore
    </button>
  );
}

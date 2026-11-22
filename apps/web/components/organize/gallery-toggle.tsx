'use client';

import type { Event } from '@hx/shared';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { useRouterTransition } from '@/lib/client/use-router-transition';
import { AlertIcon } from '../icons';
import { Busy } from '../loading-state';

/** The owner's switch for the project gallery (R40): open it to everyone, or hide it again. */
export function GalleryToggle({
  eventId,
  published,
  completed,
}: {
  eventId: string;
  /** Opened by an owner. */
  published: boolean;
  /** Results are published, so the gallery is public whatever the switch says. */
  completed: boolean;
}) {
  const navigate = useRouterTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (completed) {
    return (
      <p className="muted small" style={{ margin: 0 }}>
        Results are published, so the gallery is public.
      </p>
    );
  }

  async function toggle() {
    const next = !published;
    if (
      next &&
      !window.confirm(
        'Open the gallery to everyone? Submitted projects become public, and teams can still edit them until the deadline.',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await api<Event>(`/events/${eventId}/gallery`, {
      method: 'POST',
      body: { published: next },
    });
    if (!result.ok) {
      setBusy(false);
      setError(result.message);
      return;
    }
    navigate.refresh(() => setBusy(false));
  }

  return (
    <div className="stack-sm">
      <div className="row">
        <button
          type="button"
          className={published ? 'btn' : 'btn btn-primary'}
          disabled={busy}
          onClick={() => void toggle()}
        >
          {busy ? (
            <Busy>{published ? 'Hiding…' : 'Publishing…'}</Busy>
          ) : published ? (
            'Hide gallery'
          ) : (
            'Publish gallery'
          )}
        </button>
      </div>
      {error ? (
        <p className="field-error" role="alert" style={{ margin: 0 }}>
          <AlertIcon width={16} height={16} /> {error}
        </p>
      ) : null}
    </div>
  );
}

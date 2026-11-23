'use client';

import type { AlertUnsubscribeResult } from '@hx/shared';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { AlertIcon, CheckIcon } from '../icons';
import { Busy } from '../loading-state';

/** The one button on the unsubscribe page (R42). */
export function UnsubscribeForm({ token }: { token: string }) {
  const [state, setState] = useState<'ready' | 'sending' | 'done'>('ready');
  const [error, setError] = useState<string | null>(null);

  async function unsubscribe() {
    setState('sending');
    setError(null);
    const result = await api<AlertUnsubscribeResult>('/alerts/unsubscribe', {
      method: 'POST',
      body: { token },
    });
    if (!result.ok) {
      setState('ready');
      setError(result.message);
      return;
    }
    setState('done');
  }

  if (state === 'done') {
    return (
      <div className="stack-sm" aria-live="polite">
        <p className="row" style={{ margin: 0, gap: 8 }}>
          <CheckIcon /> <strong>You&apos;re unsubscribed.</strong>
        </p>
        <p className="muted" style={{ margin: 0 }}>
          You won&apos;t get event alert emails any more. To get them again, sign up from the event
          alerts box on any page.
        </p>
      </div>
    );
  }

  return (
    <div className="stack-sm">
      <p className="muted" style={{ margin: 0 }}>
        You&apos;ll stop getting emails about new CIReN hackathons and their applications. Emails
        about events you&apos;ve applied to still arrive.
      </p>
      <div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={state === 'sending'}
          onClick={() => void unsubscribe()}
        >
          {state === 'sending' ? <Busy>Unsubscribing…</Busy> : 'Unsubscribe'}
        </button>
      </div>
      {error ? (
        <span className="field-error" role="alert">
          <AlertIcon width={16} height={16} /> {error}
        </span>
      ) : null}
    </div>
  );
}

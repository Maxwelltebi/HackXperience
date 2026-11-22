'use client';

import type { RepoCheck } from '@hx/shared';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { AlertIcon, CheckIcon } from '../icons';
import { PixelGrid } from '../loading-state';
import { Field } from '../organize/event-form';

type Status = RepoCheck['visibility'] | 'checking' | null;

/**
 * The GitHub link on the submission form. When the field is left, it asks whether the
 * repository is public (R37): projects with a private repository can't be submitted.
 */
export function GithubField({
  value,
  error,
  onChange,
}: {
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}) {
  const [status, setStatus] = useState<Status>(null);
  const [checked, setChecked] = useState('');

  async function check() {
    const url = value.trim();
    if (!url) {
      setStatus(null);
      setChecked('');
      return;
    }
    if (url === checked && status !== null && status !== 'checking') return;
    setStatus('checking');
    const result = await api<RepoCheck>(`/github/repo?url=${encodeURIComponent(url)}`);
    setChecked(url);
    setStatus(result.ok ? result.data.visibility : 'unknown');
  }

  // The status belongs to the link it was checked for; typing a new one clears it.
  const current = value.trim() === checked || status === 'checking' ? status : null;

  return (
    <div className="stack-sm">
      <Field
        label="GitHub repository"
        error={error}
        hint="Must be public, so judges can open it. Its last commit is recorded at the deadline."
      >
        {(p) => (
          <input
            {...p}
            className="input"
            inputMode="url"
            placeholder="https://github.com/owner/repo"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => void check()}
          />
        )}
      </Field>
      {error ? null : <RepoStatus status={current} />}
    </div>
  );
}

function RepoStatus({ status }: { status: Status }) {
  if (status === 'checking') {
    return (
      <span className="hint" role="status">
        <PixelGrid /> Checking the repository…
      </span>
    );
  }
  if (status === 'public') {
    return (
      <span className="field-ok" role="status">
        <CheckIcon width={16} height={16} /> Public repository found
      </span>
    );
  }
  if (status === 'private') {
    return (
      <span className="field-error" role="alert">
        <AlertIcon width={16} height={16} /> This repository is private or doesn&apos;t exist. Make
        it public on GitHub before you submit.
      </span>
    );
  }
  if (status === 'unknown') {
    return (
      <span className="hint" role="status">
        Couldn&apos;t reach GitHub to check. You can still save and submit.
      </span>
    );
  }
  return null;
}

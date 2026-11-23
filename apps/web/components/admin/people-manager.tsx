'use client';

import type { AdminPeople, AdminPerson, PlatformAdmin } from '@hx/shared';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/client/api';
import { AlertIcon, CheckIcon } from '../icons';
import { Busy } from '../loading-state';
import { Field } from '../organize/event-form';

type Notice = { tone: 'success' | 'danger'; text: string } | null;

/**
 * Organizers, which platform admins add and remove (existing accounts only), and the fixed list
 * of platform admins, which only changes in the database (R43, R44).
 */
export function PeopleManager({ initial, viewerId }: { initial: AdminPeople; viewerId: string }) {
  const [people, setPeople] = useState(initial);
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <OrganizersPanel organizers={people.organizers} viewerId={viewerId} onChange={setPeople} />
      <AdminsPanel admins={people.admins} viewerId={viewerId} />
    </div>
  );
}

function OrganizersPanel({
  organizers,
  viewerId,
  onChange,
}: {
  organizers: AdminPerson[];
  viewerId: string;
  onChange: (people: AdminPeople) => void;
}) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const result = await api<AdminPeople>('/admin/organizers', {
      method: 'POST',
      body: { email },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.fields.email);
      if (!result.fields.email) setNotice({ tone: 'danger', text: result.message });
      return;
    }
    setError(undefined);
    setEmail('');
    onChange(result.data);
    setNotice({ tone: 'success', text: 'Added. They can create events from Organize now.' });
  }

  async function remove(person: AdminPerson) {
    const question = `Remove ${person.name || person.email} as an organizer? Their events and event roles stay.`;
    if (!window.confirm(question)) return;
    setNotice(null);
    setRemoving(person.id);
    const result = await api<AdminPeople>(`/admin/organizers/${person.id}`, {
      method: 'DELETE',
    });
    setRemoving(null);
    if (!result.ok) {
      setNotice({ tone: 'danger', text: result.message });
      return;
    }
    onChange(result.data);
  }

  return (
    <section className="panel card stack" aria-labelledby="organizers-title">
      <div className="stack-sm" style={{ gap: 2 }}>
        <h2 id="organizers-title" className="h2">
          Organizers <span className="mono muted">{organizers.length}</span>
        </h2>
        <span className="muted small">
          Can create CIReN events. They own the events they create and add their own staff.
        </span>
      </div>

      {organizers.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          Nobody can create events yet.
        </p>
      ) : (
        <ul className="people-list">
          {organizers.map((person) => (
            <li key={person.id} className="row-between">
              <span>
                <strong>{person.name || 'No name'}</strong>
                {person.id === viewerId ? <span className="muted small"> (you)</span> : null}
                <span className="sub">{person.email}</span>
              </span>
              <button
                type="button"
                className="link-button small"
                style={{ color: 'var(--danger)' }}
                disabled={removing !== null}
                onClick={() => void remove(person)}
              >
                {removing === person.id ? <Busy>Removing…</Busy> : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="stack-sm" onSubmit={add} noValidate>
        <Field
          label="Email address"
          error={error}
          hint="They must have signed in to HackXperience once, with Google or GitHub."
        >
          {(p) => (
            <input
              {...p}
              type="email"
              className="input"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <div>
          <button type="submit" className="btn" disabled={busy || !email}>
            {busy ? <Busy>Adding…</Busy> : 'Add organizer'}
          </button>
        </div>
        {notice ? (
          <p
            className={`banner banner-${notice.tone}`}
            role={notice.tone === 'danger' ? 'alert' : 'status'}
            style={{ margin: 0 }}
          >
            {notice.tone === 'success' ? <CheckIcon /> : <AlertIcon />} {notice.text}
          </p>
        ) : null}
      </form>
    </section>
  );
}

/** The fixed list (R44): read-only here. */
function AdminsPanel({ admins, viewerId }: { admins: PlatformAdmin[]; viewerId: string }) {
  return (
    <section className="panel card stack" aria-labelledby="admins-title">
      <div className="stack-sm" style={{ gap: 2 }}>
        <h2 id="admins-title" className="h2">
          Platform admins <span className="mono muted">{admins.length}</span>
        </h2>
        <span className="muted small">
          Can use this admin area and have owner rights at every event. There are at most two, and
          they can only be changed in the database, not from here.
        </span>
      </div>
      <ul className="people-list">
        {admins.map((admin) => (
          <li key={admin.email} className="row-between">
            <span>
              <strong>{admin.name ?? 'Not signed in yet'}</strong>
              {admin.id === viewerId ? <span className="muted small"> (you)</span> : null}
              <span className="sub">{admin.email}</span>
            </span>
            {admin.active ? (
              <span className="chip chip-success">Active</span>
            ) : (
              <span className="chip chip-muted">Waiting for first sign-in</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

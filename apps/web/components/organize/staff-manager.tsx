'use client';

import {
  STAFF_ROLES,
  type StaffInvite,
  type StaffList,
  type StaffMember,
  type StaffRole,
} from '@hx/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/client/api';
import { AlertIcon, CheckIcon } from '../icons';
import { Field } from './event-form';
import { Busy } from '@/components/loading-state';

const ROLE_INFO: Record<StaffRole, { label: string; does: string }> = {
  owner: { label: 'Owner', does: 'Everything, including staff and the audit log' },
  admin: { label: 'Admin', does: 'Edit the event, decide applications, manual check-in' },
  judge: { label: 'Judge', does: 'Scores the projects assigned to them' },
  mentor: { label: 'Mentor', does: 'Answers help requests from teams' },
  volunteer: { label: 'Volunteer', does: 'Scans tickets at the door' },
};

type Notice = { tone: 'success' | 'danger'; text: string } | null;

/**
 * Staff for one event (owner only). Anyone can be added by email (R39): someone with an account
 * gets the role and an email now; anyone else gets an invitation, and the role is theirs when
 * they first sign in with that address.
 */
export function StaffManager({
  eventId,
  viewerId,
  initial,
}: {
  eventId: string;
  viewerId: string;
  initial: StaffList;
}) {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffMember[]>(initial.items);
  const [invites, setInvites] = useState<StaffInvite[]>(initial.invites);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('judge');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  function show(list: StaffList) {
    setStaff(list.items);
    setInvites(list.invites);
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const address = email.trim().toLowerCase();
    const result = await api<StaffList>(`/events/${eventId}/staff`, {
      method: 'POST',
      body: { email, role },
    });
    setBusy(false);
    if (!result.ok) {
      setErrors(result.fields);
      if (Object.keys(result.fields).length === 0) {
        setNotice({ tone: 'danger', text: result.message });
      }
      return;
    }
    setErrors({});
    setEmail('');
    show(result.data);
    const label = ROLE_INFO[role].label.toLowerCase();
    const invited = result.data.invites.some((i) => i.email === address && i.role === role);
    setNotice({
      tone: 'success',
      text: invited
        ? `Invitation sent. ${address} has no account yet: they become ${label} when they first sign in with that address.`
        : `Added as ${label}. They get an email with a link to their tools.`,
    });
  }

  async function remove(member: StaffMember) {
    const self = member.user_id === viewerId;
    const question = self
      ? `Remove your own ${ROLE_INFO[member.role].label.toLowerCase()} role?`
      : `Remove ${member.name || member.email} as ${ROLE_INFO[member.role].label.toLowerCase()}?`;
    if (!window.confirm(question)) return;
    setNotice(null);
    setRemoving(`${member.user_id}:${member.role}`);
    const result = await api<StaffList>(`/events/${eventId}/staff`, {
      method: 'DELETE',
      body: { user_id: member.user_id, role: member.role },
    });
    setRemoving(null);
    if (!result.ok) {
      setNotice({ tone: 'danger', text: result.message });
      return;
    }
    show(result.data);
    if (self) router.refresh();
  }

  async function withdraw(invite: StaffInvite) {
    if (!window.confirm(`Withdraw the invitation for ${invite.email}?`)) return;
    setNotice(null);
    setRemoving(invite.id);
    const result = await api<StaffList>(`/events/${eventId}/staff/invites/${invite.id}`, {
      method: 'DELETE',
    });
    setRemoving(null);
    if (!result.ok) {
      setNotice({ tone: 'danger', text: result.message });
      return;
    }
    show(result.data);
  }

  return (
    <div className="stack">
      <form className="panel card stack" onSubmit={add} noValidate>
        <div className="stack-sm" style={{ gap: 2 }}>
          <h2 className="h2">Add someone</h2>
          <span className="muted small">
            They get an email. If they don&apos;t have an account yet, the email invites them to
            sign in with Google or GitHub, and the role is theirs once they do.
          </span>
        </div>
        <div className="grid-2">
          <Field
            label="Email address"
            error={errors.email}
            hint="Use the address of their Google or GitHub account."
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
          <Field label="Role" error={errors.role} hint={ROLE_INFO[role].does}>
            {(p) => (
              <select
                {...p}
                className="select"
                value={role}
                onChange={(e) => setRole(e.target.value as StaffRole)}
              >
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_INFO[r].label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={busy || !email}>
            {busy ? <Busy>Adding…</Busy> : 'Add'}
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

      <div className="panel table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <tr key={`${member.user_id}:${member.role}`}>
                <td>
                  <strong>{member.name || 'No name'}</strong>
                  <span className="sub">{member.email}</span>
                </td>
                <td>{ROLE_INFO[member.role].label}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className="link-button"
                    style={{ color: 'var(--danger)' }}
                    disabled={removing !== null}
                    onClick={() => void remove(member)}
                  >
                    {removing === `${member.user_id}:${member.role}` ? 'Removing…' : 'Remove'}
                  </button>
                </td>
              </tr>
            ))}
            {invites.map((invite) => (
              <tr key={invite.id}>
                <td>
                  <strong>{invite.email}</strong>
                  <span className="sub">Invited. Waiting for them to sign in.</span>
                </td>
                <td>
                  {ROLE_INFO[invite.role].label} <span className="chip chip-warning">Invited</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className="link-button"
                    style={{ color: 'var(--danger)' }}
                    disabled={removing !== null}
                    onClick={() => void withdraw(invite)}
                  >
                    {removing === invite.id ? 'Withdrawing…' : 'Withdraw'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

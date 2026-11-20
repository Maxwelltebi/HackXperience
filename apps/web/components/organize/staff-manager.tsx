'use client';

import { STAFF_ROLES, type StaffMember, type StaffRole } from '@hx/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/client/api';
import { AlertIcon } from '../icons';
import { Field } from './event-form';

const ROLE_INFO: Record<StaffRole, { label: string; does: string }> = {
  owner: { label: 'Owner', does: 'Everything, including staff and the audit log' },
  admin: { label: 'Admin', does: 'Edit the event, decide applications, manual check-in' },
  judge: { label: 'Judge', does: 'Scores the projects assigned to them' },
  mentor: { label: 'Mentor', does: 'Answers help requests from teams' },
  volunteer: { label: 'Volunteer', does: 'Scans tickets at the door' },
};

export function StaffManager({
  eventId,
  viewerId,
  initial,
}: {
  eventId: string;
  viewerId: string;
  initial: StaffMember[];
}) {
  const router = useRouter();
  const [staff, setStaff] = useState(initial);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('judge');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    const result = await api<{ items: StaffMember[] }>(`/events/${eventId}/staff`, {
      method: 'POST',
      body: { email, role },
    });
    setBusy(false);
    if (!result.ok) {
      setErrors(result.fields);
      setFailure(Object.keys(result.fields).length === 0 ? result.message : null);
      return;
    }
    setErrors({});
    setEmail('');
    setStaff(result.data.items);
  }

  async function remove(member: StaffMember) {
    const self = member.user_id === viewerId;
    const question = self
      ? `Remove your own ${ROLE_INFO[member.role].label.toLowerCase()} role?`
      : `Remove ${member.name || member.email} as ${ROLE_INFO[member.role].label.toLowerCase()}?`;
    if (!window.confirm(question)) return;
    setFailure(null);
    const result = await api<{ items: StaffMember[] }>(`/events/${eventId}/staff`, {
      method: 'DELETE',
      body: { user_id: member.user_id, role: member.role },
    });
    if (!result.ok) {
      setFailure(result.message);
      return;
    }
    setStaff(result.data.items);
    if (self) router.refresh();
  }

  return (
    <div className="stack">
      <form className="raised card stack" onSubmit={add} noValidate>
        <h2 className="h2">Add someone</h2>
        <div className="grid-2">
          <Field label="Email they sign in with" error={errors.email}>
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
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>
        {failure ? (
          <p className="banner banner-danger" role="alert" style={{ margin: 0 }}>
            <AlertIcon /> {failure}
          </p>
        ) : null}
      </form>

      <div className="raised table-wrap">
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
                    onClick={() => void remove(member)}
                  >
                    Remove
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

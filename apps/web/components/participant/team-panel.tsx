'use client';

import { formatInviteCode } from '@hx/core';
import type { MyTeam, OpenTeam } from '@hx/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/client/api';
import { initials } from '@/lib/ui/initials';
import { AlertIcon, CheckIcon } from '../icons';
import { Field } from '../organize/event-form';
import styles from './team-panel.module.css';
import { Busy } from '@/components/loading-state';

interface Props {
  eventId: string;
  viewerId: string;
  initialTeam: MyTeam | null;
  initialBoard: OpenTeam[];
  teamSizeMax: number;
  /** Past the submission deadline: teams can no longer change. */
  closed: boolean;
}

type Notice = { tone: 'success' | 'danger'; text: string } | null;

export function TeamPanel({
  eventId,
  viewerId,
  initialTeam,
  initialBoard,
  teamSizeMax,
  closed,
}: Props) {
  const router = useRouter();
  const [team, setTeam] = useState(initialTeam);
  const [notice, setNotice] = useState<Notice>(null);

  const done = (next: MyTeam | null, text?: string) => {
    setTeam(next);
    setNotice(text ? { tone: 'success', text } : null);
    router.refresh();
  };
  const fail = (text: string) => setNotice({ tone: 'danger', text });

  return (
    <div className="stack">
      {notice ? (
        <p className={`banner banner-${notice.tone}`} role="status" style={{ margin: 0 }}>
          {notice.tone === 'success' ? <CheckIcon /> : <AlertIcon />} {notice.text}
        </p>
      ) : null}
      {team ? (
        <MyTeamCard
          eventId={eventId}
          viewerId={viewerId}
          team={team}
          closed={closed}
          onChange={done}
          onError={fail}
        />
      ) : closed ? (
        <div className="panel empty">
          <strong>You&apos;re not on a team</strong>
          <span>Teams closed at the submission deadline.</span>
        </div>
      ) : (
        <>
          <div className="grid-2">
            <CreateTeam
              eventId={eventId}
              onDone={(t) => done(t, `Team “${t.name}” created. Share the invite code.`)}
            />
            <JoinTeam eventId={eventId} onDone={(t) => done(t, `You joined ${t.name}.`)} />
          </div>
          <Board teams={initialBoard} teamSizeMax={teamSizeMax} />
        </>
      )}
    </div>
  );
}

function MyTeamCard({
  eventId,
  viewerId,
  team,
  closed,
  onChange,
  onError,
}: {
  eventId: string;
  viewerId: string;
  team: MyTeam;
  closed: boolean;
  onChange: (team: MyTeam | null, text?: string) => void;
  onError: (text: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lookingFor, setLookingFor] = useState(team.looking_for ?? '');
  const isOwner = team.owner_id === viewerId;
  const full = team.members.length >= team.team_size_max;

  async function run<T>(
    key: string,
    request: () => Promise<{ ok: true; data: T } | { ok: false; message: string }>,
  ) {
    setBusy(key);
    const result = await request();
    setBusy(null);
    if (!result.ok) {
      onError(result.message);
      return null;
    }
    return result.data;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatInviteCode(team.invite_code));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onError('Copy failed. Select the code and copy it by hand.');
    }
  }

  async function rotate() {
    if (!window.confirm('Make a new invite code? The old one stops working.')) return;
    const next = await run('rotate', () =>
      api<MyTeam>(`/events/${eventId}/teams/me/invite-code/rotate`, { method: 'POST' }),
    );
    if (next) onChange(next, 'New invite code ready. The old one no longer works.');
  }

  async function saveBoard(looking: boolean) {
    const next = await run('board', () =>
      api<MyTeam>(`/events/${eventId}/teams/me`, {
        method: 'PATCH',
        body: { looking_for_members: looking, looking_for: lookingFor },
      }),
    );
    if (next)
      onChange(
        next,
        looking ? 'Your team is on the team board.' : 'Your team is off the team board.',
      );
  }

  async function remove(userId: string, name: string) {
    if (!window.confirm(`Remove ${name} from the team?`)) return;
    const next = await run(`remove:${userId}`, () =>
      api<MyTeam>(`/events/${eventId}/teams/me/members/${userId}`, { method: 'DELETE' }),
    );
    if (next) onChange(next, `${name} was removed.`);
  }

  async function leave() {
    const last = team.members.length === 1;
    const question = last
      ? 'Leave and delete this team? You are its only member.'
      : 'Leave this team?';
    if (!window.confirm(question)) return;
    setBusy('leave');
    const result = await api<null>(`/events/${eventId}/teams/me/leave`, { method: 'POST' });
    setBusy(null);
    if (!result.ok) {
      onError(result.message);
      return;
    }
    onChange(null, last ? 'You left, and the team was deleted.' : 'You left the team.');
  }

  return (
    <>
      <section className="panel card stack" aria-labelledby="team-name">
        <div className="row-between">
          <div>
            <span className="eyebrow eyebrow-muted">Your team</span>
            <h2 id="team-name" className={styles.teamName}>
              {team.name}
            </h2>
          </div>
          <span className="muted small">
            {team.members.length} of {team.team_size_max}
            {full ? ' · full' : ''}
          </span>
        </div>

        <ul className={styles.members}>
          {team.members.map((member) => (
            <li key={member.user_id} className={styles.member}>
              <span className="avatar" aria-hidden="true">
                {initials(member.name)}
              </span>
              <span className={styles.memberText}>
                <strong>
                  {member.name || 'No name'}
                  {member.user_id === team.owner_id ? (
                    <span className="muted small"> · owner</span>
                  ) : null}
                  {member.user_id === viewerId ? <span className="muted small"> · you</span> : null}
                </strong>
                {member.school ? <span className="muted small">{member.school}</span> : null}
              </span>
              {isOwner && member.user_id !== viewerId && !closed ? (
                <button
                  type="button"
                  className="link-button"
                  style={{ color: 'var(--danger)' }}
                  disabled={busy !== null}
                  onClick={() => void remove(member.user_id, member.name)}
                >
                  {busy === `remove:${member.user_id}` ? 'Removing…' : 'Remove'}
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {!closed ? (
          <div className={`well ${styles.code}`}>
            <span>
              <span className="muted small">Invite code</span>
              <span className={styles.codeValue}>{formatInviteCode(team.invite_code)}</span>
            </span>
            <span className="row">
              <button type="button" className="btn btn-sm" onClick={() => void copy()}>
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                className="link-button"
                disabled={busy !== null}
                onClick={() => void rotate()}
              >
                {busy === 'rotate' ? 'Making a new code…' : 'New code'}
              </button>
            </span>
          </div>
        ) : null}
      </section>

      {!closed && !full ? (
        <section className="panel card stack" aria-labelledby="board-title">
          <div className="stack-sm" style={{ gap: 2 }}>
            <h2 id="board-title" className="h2">
              Need people?
            </h2>
            <span className="muted small">
              Post your team on the team board. Others see your names and what you need, never your
              invite code.
            </span>
          </div>
          <Field
            label="Who you're looking for"
            hint="For example: a designer, someone who knows Flutter"
          >
            {(p) => (
              <input
                {...p}
                className="input"
                maxLength={280}
                value={lookingFor}
                onChange={(e) => setLookingFor(e.target.value)}
              />
            )}
          </Field>
          <div className="row">
            <button
              type="button"
              className={team.looking_for_members ? 'btn' : 'btn btn-primary'}
              disabled={busy !== null}
              onClick={() => void saveBoard(true)}
            >
              {busy === 'board' ? (
                <Busy>Saving…</Busy>
              ) : team.looking_for_members ? (
                'Update post'
              ) : (
                'Post on the board'
              )}
            </button>
            {team.looking_for_members ? (
              <button
                type="button"
                className="btn"
                disabled={busy !== null}
                onClick={() => void saveBoard(false)}
              >
                Take it down
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {!closed ? (
        <div>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy !== null}
            onClick={() => void leave()}
          >
            {busy === 'leave' ? <Busy>Leaving…</Busy> : 'Leave team'}
          </button>
        </div>
      ) : null}
    </>
  );
}

function CreateTeam({ eventId, onDone }: { eventId: string; onDone: (team: MyTeam) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  // One id per attempt: a double click or retry creates one team, not two.
  const [requestId] = useState(() => crypto.randomUUID());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const result = await api<MyTeam>(`/events/${eventId}/teams`, {
      method: 'POST',
      body: { id: requestId, name },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.fields.name ?? result.message);
      return;
    }
    onDone(result.data);
  }

  return (
    <form className="panel card stack" onSubmit={submit} noValidate>
      <h2 className="h2">Start a team</h2>
      <Field label="Team name" error={error}>
        {(p) => (
          <input
            {...p}
            className="input"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
        {busy ? <Busy>Creating…</Busy> : 'Create team'}
      </button>
    </form>
  );
}

function JoinTeam({ eventId, onDone }: { eventId: string; onDone: (team: MyTeam) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const result = await api<MyTeam>(`/events/${eventId}/teams/join`, {
      method: 'POST',
      body: { invite_code: code },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.fields.invite_code ?? result.message);
      return;
    }
    onDone(result.data);
  }

  return (
    <form className="panel card stack" onSubmit={submit} noValidate>
      <h2 className="h2">Join with a code</h2>
      <Field label="Invite code" error={error} hint="8 characters, from a teammate">
        {(p) => (
          <input
            {...p}
            className="input code"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={12}
            placeholder="K7QM X4PR"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        )}
      </Field>
      <button type="submit" className="btn" disabled={busy || code.replace(/\s/g, '').length < 8}>
        {busy ? <Busy>Joining…</Busy> : 'Join team'}
      </button>
    </form>
  );
}

function Board({ teams, teamSizeMax }: { teams: OpenTeam[]; teamSizeMax: number }) {
  return (
    <section className="panel card stack" aria-labelledby="board-list">
      <div className="stack-sm" style={{ gap: 2 }}>
        <h2 id="board-list" className="h2">
          Team board
        </h2>
        <span className="muted small">
          Teams looking for people. Find them at the venue or in the event group chat, and ask for
          their invite code.
        </span>
      </div>
      {teams.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          No teams are looking for members right now.
        </p>
      ) : (
        <ul className={styles.board}>
          {teams.map((team) => (
            <li key={team.id} className={`well ${styles.boardItem}`}>
              <div className="row-between">
                <strong>{team.name}</strong>
                <span className="muted small">
                  {team.member_count} of {teamSizeMax}
                </span>
              </div>
              {team.looking_for ? <span>Looking for: {team.looking_for}</span> : null}
              <span className="muted small">
                {team.members
                  .map((m) => (m.school ? `${m.name} (${m.school})` : m.name))
                  .join(', ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

'use client';

import { ratingTotal, teamAverages, teamSizes } from '@hx/core';
import {
  SKILL_LABELS,
  SKILLS,
  type DraftTeam,
  type FormationPerson,
  type PublishDraftResult,
  type SkillRatings,
  type TeamFormation,
} from '@hx/shared';
import { useMemo, useState } from 'react';
import { api } from '@/lib/client/api';
import { useRouterTransition } from '@/lib/client/use-router-transition';
import { AlertIcon, CheckIcon } from '../icons';
import { Busy } from '../loading-state';

type Action = 'auto' | 'manual' | 'save' | 'discard' | 'publish';
type Notice = { tone: 'success' | 'danger' | 'warning'; text: string } | null;

const NOT_PLACED = '';

/**
 * Organizer team forming (R36): group confirmed participants who have no team into balanced
 * teams by their skill ratings, automatically or by hand, as a draft only organizers see; then
 * publish. Every change to the draft is saved straight away.
 */
export function TeamFormationPanel({
  eventId,
  initial,
  closed,
}: {
  eventId: string;
  initial: TeamFormation;
  /** Past the submission deadline: teams are final. */
  closed: boolean;
}) {
  const navigate = useRouterTransition();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState<Action | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [teamSize, setTeamSize] = useState(initial.team_size_max);

  const people = useMemo(() => new Map(state.pool.map((p) => [p.user_id, p])), [state.pool]);
  const draft = state.draft;
  const placed = new Set(draft?.teams.flatMap((t) => t.member_ids) ?? []);
  const unplaced = state.pool.filter((p) => !placed.has(p.user_id));
  const sizes = Array.from(
    { length: state.team_size_max - state.team_size_min + 1 },
    (_, i) => state.team_size_min + i,
  );
  const locked = busy !== null || navigate.pending;

  async function reload() {
    const result = await api<TeamFormation>(`/events/${eventId}/team-formation`);
    if (result.ok) setState(result.data);
  }

  async function send(
    action: Action,
    path: string,
    method: 'POST' | 'PUT' | 'DELETE',
    body?: unknown,
  ): Promise<boolean> {
    setBusy(action);
    setNotice(null);
    const result = await api<TeamFormation>(`/events/${eventId}/team-formation${path}`, {
      method,
      ...(body === undefined ? {} : { body }),
    });
    setBusy(null);
    if (result.ok) {
      setState(result.data);
      return true;
    }
    setNotice({ tone: 'danger', text: result.message });
    if (result.code === 'STALE_VERSION') await reload();
    return false;
  }

  const saveTeams = (teams: DraftTeam[]) =>
    send('save', '/draft', 'PUT', { version: draft?.version ?? 0, teams });

  async function autoGroup() {
    if (draft && !window.confirm('Replace the current draft with new automatic teams?')) return;
    const ok = await send('auto', '/auto', 'POST', {
      team_size: teamSize,
      version: draft?.version ?? 0,
    });
    if (ok) {
      setNotice({
        tone: 'success',
        text: 'Draft ready. Move people if you want, then publish. Nobody sees it until then.',
      });
    }
  }

  async function groupByHand() {
    const count = Math.max(1, teamSizes(state.pool.length, teamSize).length);
    const teams = Array.from({ length: count }, (_, i) => ({
      name: `Team ${i + 1}`,
      member_ids: [],
    }));
    await saveTeams(teams);
  }

  async function discard() {
    if (!window.confirm('Throw away this draft? Nobody has seen it.')) return;
    await send('discard', '/draft', 'DELETE');
  }

  async function publish() {
    if (!draft) return;
    const teams = draft.teams.filter((t) => t.member_ids.length > 0);
    if (
      !window.confirm(
        `Publish ${teams.length} ${teams.length === 1 ? 'team' : 'teams'}? Each person gets an email with their team.`,
      )
    ) {
      return;
    }
    setBusy('publish');
    setNotice(null);
    const result = await api<PublishDraftResult>(`/events/${eventId}/team-formation/publish`, {
      method: 'POST',
      body: { version: draft.version },
    });
    if (!result.ok) {
      setBusy(null);
      setNotice({ tone: 'danger', text: result.message });
      if (result.code === 'STALE_VERSION') await reload();
      return;
    }
    const { teams: made, placed: count, skipped } = result.data;
    setNotice({
      tone: skipped.length > 0 ? 'warning' : 'success',
      text:
        `Published ${made} ${made === 1 ? 'team' : 'teams'} with ${count} ${count === 1 ? 'person' : 'people'}. Emails go out shortly.` +
        (skipped.length > 0
          ? ` Left out because they joined a team or lost their place: ${skipped.map((s) => s.name || 'someone').join(', ')}.`
          : ''),
    });
    await reload();
    navigate.refresh(() => setBusy(null));
  }

  /** Moves a person to the team at `target` (an index), or out of every team. */
  function move(userId: string, target: string) {
    if (!draft) return;
    const teams = draft.teams.map((t) => ({
      ...t,
      member_ids: t.member_ids.filter((id) => id !== userId),
    }));
    if (target !== NOT_PLACED) teams[Number(target)]?.member_ids.push(userId);
    void saveTeams(teams);
  }

  function rename(index: number, name: string) {
    if (!draft || !name.trim() || draft.teams[index]?.name === name.trim()) return;
    void saveTeams(draft.teams.map((t, i) => (i === index ? { ...t, name: name.trim() } : t)));
  }

  function addTeam() {
    if (!draft) return;
    void saveTeams([...draft.teams, { name: `Team ${draft.teams.length + 1}`, member_ids: [] }]);
  }

  function removeTeam(index: number) {
    if (!draft) return;
    void saveTeams(draft.teams.filter((_, i) => i !== index));
  }

  const teamOptions = draft?.teams.map((t, i) => ({ value: String(i), label: t.name })) ?? [];

  return (
    <section className="panel card stack" aria-labelledby="form-teams-title">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="stack-sm" style={{ gap: 2 }}>
          <h2 id="form-teams-title" className="h2">
            Form teams
          </h2>
          <span className="muted small">
            {state.pool.length === 0
              ? 'Everyone who confirmed is on a team.'
              : `${state.pool.length} confirmed ${state.pool.length === 1 ? 'participant has' : 'participants have'} no team. Teams people formed themselves are left as they are.`}
          </span>
        </div>
        {draft ? <span className="chip chip-warning">Draft · only organizers see it</span> : null}
      </div>

      {notice ? (
        <p className={`banner banner-${notice.tone}`} role="status" style={{ margin: 0 }}>
          {notice.tone === 'success' ? <CheckIcon /> : <AlertIcon />} {notice.text}
        </p>
      ) : null}

      {closed ? (
        <p className="muted small" style={{ margin: 0 }}>
          The submission deadline has passed, so teams are final.
        </p>
      ) : state.pool.length === 0 && !draft ? null : (
        <div className="row" style={{ alignItems: 'end' }}>
          <label className="field" style={{ width: 180 }}>
            <span className="label">People per team</span>
            <select
              className="select"
              value={teamSize}
              disabled={locked}
              onChange={(e) => setTeamSize(Number(e.target.value))}
            >
              {sizes.map((n) => (
                <option key={n} value={n}>
                  Up to {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={draft ? 'btn' : 'btn btn-primary'}
            disabled={locked || state.pool.length === 0}
            onClick={() => void autoGroup()}
          >
            {busy === 'auto' ? (
              <Busy>Grouping…</Busy>
            ) : draft ? (
              'Regroup automatically'
            ) : (
              `Auto-group ${state.pool.length} ${state.pool.length === 1 ? 'person' : 'people'}`
            )}
          </button>
          {draft ? null : (
            <button
              type="button"
              className="btn"
              disabled={locked || state.pool.length === 0}
              onClick={() => void groupByHand()}
            >
              {busy === 'save' ? <Busy>Starting…</Busy> : 'Group by hand'}
            </button>
          )}
        </div>
      )}

      {!draft ? (
        state.pool.length > 0 ? (
          <PoolTable people={state.pool} />
        ) : null
      ) : (
        <>
          <div
            className={`stack ${busy === 'save' ? 'is-refreshing' : ''}`}
            aria-busy={busy === 'save'}
          >
            {unplaced.length > 0 ? (
              <div className="well card-tight stack-sm">
                <strong className="small">
                  Not placed <span className="mono muted">{unplaced.length}</span>
                </strong>
                <ul className="team-draft-members">
                  {sortByTotal(unplaced).map((person) => (
                    <MemberRow
                      key={person.user_id}
                      person={person}
                      current={NOT_PLACED}
                      options={teamOptions}
                      disabled={locked || closed}
                      onMove={(target) => move(person.user_id, target)}
                    />
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="team-draft-grid">
              {draft.teams.map((team, index) => (
                <DraftTeamCard
                  key={`${index}:${team.name}`}
                  team={team}
                  index={index}
                  people={people}
                  options={teamOptions}
                  min={state.team_size_min}
                  max={state.team_size_max}
                  disabled={locked || closed}
                  onMove={move}
                  onRename={(name) => rename(index, name)}
                  onRemove={() => removeTeam(index)}
                />
              ))}
            </div>
          </div>

          {closed ? null : (
            <div className="row-between">
              <div className="row">
                <button type="button" className="btn btn-sm" disabled={locked} onClick={addTeam}>
                  Add a team
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  disabled={locked}
                  onClick={() => void discard()}
                >
                  {busy === 'discard' ? <Busy>Discarding…</Busy> : 'Discard draft'}
                </button>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={locked || placed.size === 0}
                onClick={() => void publish()}
              >
                {busy === 'publish' || navigate.pending ? (
                  <Busy>Publishing…</Busy>
                ) : (
                  `Publish ${draft.teams.filter((t) => t.member_ids.length > 0).length} teams`
                )}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function sortByTotal(people: FormationPerson[]): FormationPerson[] {
  return [...people].sort(
    (a, b) =>
      ratingTotal(b.skill_ratings) - ratingTotal(a.skill_ratings) || a.name.localeCompare(b.name),
  );
}

/** "C4 D2 B3 P5", with strong ratings (4 and 5) marked. */
export function Ratings({ ratings }: { ratings: SkillRatings | null }) {
  if (!ratings) return <span className="chip chip-muted">No ratings</span>;
  return (
    <span
      className="ratings"
      aria-label={SKILLS.map((s) => `${SKILL_LABELS[s]} ${ratings[s]}`).join(', ')}
    >
      {SKILLS.map((skill) => (
        <span key={skill} data-strong={ratings[skill] >= 4} aria-hidden="true">
          {SKILL_LABELS[skill][0]}
          {ratings[skill]}
        </span>
      ))}
    </span>
  );
}

function PoolTable({ people }: { people: FormationPerson[] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Participant</th>
            <th>School</th>
            <th>Skills</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {sortByTotal(people).map((person) => (
            <tr key={person.user_id}>
              <td>
                <strong>{person.name || 'No name'}</strong>
              </td>
              <td className="small">{person.school ?? '–'}</td>
              <td>
                <Ratings ratings={person.skill_ratings} />
              </td>
              <td className="num">
                {person.skill_ratings ? ratingTotal(person.skill_ratings) : '–'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint card-tight" style={{ margin: 0 }}>
        C Coding, D Design, B Business, P Presentation; 1 to 5. People with no ratings count as 3.
      </p>
    </div>
  );
}

function MemberRow({
  person,
  current,
  options,
  disabled,
  onMove,
}: {
  person: FormationPerson;
  current: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  onMove: (target: string) => void;
}) {
  return (
    <li className="team-draft-member">
      <span>
        <strong className="small">{person.name || 'No name'}</strong>
        {person.school ? <span className="sub">{person.school}</span> : null}
      </span>
      <Ratings ratings={person.skill_ratings} />
      <select
        className="select team-draft-move"
        aria-label={`Move ${person.name || 'this person'}`}
        value={current}
        disabled={disabled}
        onChange={(e) => onMove(e.target.value)}
      >
        <option value={NOT_PLACED}>{current === NOT_PLACED ? 'Add to…' : 'Not placed'}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </li>
  );
}

function DraftTeamCard({
  team,
  index,
  people,
  options,
  min,
  max,
  disabled,
  onMove,
  onRename,
  onRemove,
}: {
  team: DraftTeam;
  index: number;
  people: Map<string, FormationPerson>;
  options: { value: string; label: string }[];
  min: number;
  max: number;
  disabled: boolean;
  onMove: (userId: string, target: string) => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(team.name);
  const members = team.member_ids.map((id) => people.get(id));
  const averages = teamAverages(members.filter(Boolean).map((p) => p?.skill_ratings ?? null));
  const size = team.member_ids.length;

  return (
    <article className="panel card-tight stack-sm" aria-label={team.name}>
      <div className="row-between" style={{ gap: 8 }}>
        <input
          className="input team-draft-name"
          aria-label={`Name of ${team.name}`}
          value={name}
          maxLength={60}
          disabled={disabled}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => onRename(name)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        {size < min ? (
          <span className="chip chip-warning">Below {min}</span>
        ) : size > max ? (
          <span className="chip chip-danger">Over {max}</span>
        ) : (
          <span className="mono small muted">{size}</span>
        )}
      </div>
      {size > 0 ? (
        <p className="ratings" style={{ margin: 0 }} aria-label="Team averages">
          {SKILLS.map((skill, i) => (
            <span key={skill} title={`${SKILL_LABELS[skill]} average`}>
              {SKILL_LABELS[skill][0]}
              {(averages[i] ?? 0).toFixed(1)}
            </span>
          ))}
        </p>
      ) : null}
      {size === 0 ? (
        <div className="row-between">
          <span className="muted small">Empty. Add people from Not placed.</span>
          <button
            type="button"
            className="link-button small"
            disabled={disabled}
            onClick={onRemove}
          >
            Remove team
          </button>
        </div>
      ) : (
        <ul className="team-draft-members">
          {team.member_ids.map((id) => {
            const person = people.get(id);
            return person ? (
              <MemberRow
                key={id}
                person={person}
                current={String(index)}
                options={options}
                disabled={disabled}
                onMove={(target) => onMove(id, target)}
              />
            ) : (
              <li key={id} className="team-draft-member">
                <span className="muted small">Joined a team or lost their place</span>
                <button
                  type="button"
                  className="link-button small"
                  disabled={disabled}
                  onClick={() => onMove(id, NOT_PLACED)}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

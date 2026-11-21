'use client';

import type {
  AssignJudgesResult,
  AwardResult,
  EventStatus,
  StandingRow,
  Standings,
  Track,
} from '@hx/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/client/api';
import { AlertIcon, CheckIcon } from '../icons';

interface Props {
  eventId: string;
  status: EventStatus;
  standings: Standings;
  awards: AwardResult[];
  tracks: Track[];
  rubricCount: number;
}

type Notice = { tone: 'success' | 'danger'; text: string } | null;

const fmt = (n: number | null, digits = 1) => (n === null ? '–' : n.toFixed(digits));

/** Organizer judging screen: assign judges, read standings (raw and normalized), pick winners. */
export function JudgingManager({ eventId, status, standings, awards, tracks, rubricCount }: Props) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const judging = status === 'judging';
  const completed = status === 'completed';
  const { scored, expected } = standings.progress;

  return (
    <div className="stack">
      {notice ? (
        <p className={`banner banner-${notice.tone}`} role="status" style={{ margin: 0 }}>
          {notice.tone === 'success' ? <CheckIcon /> : <AlertIcon />} {notice.text}
        </p>
      ) : null}

      <section className="raised card stack" aria-labelledby="progress-title">
        <div className="row-between">
          <h2 id="progress-title" className="h2">
            Progress
          </h2>
          <span className="mono">
            {scored} of {expected} scores in
          </span>
        </div>
        {judging ? (
          <AssignForm
            eventId={eventId}
            hasAssignments={expected > 0}
            onDone={(text, tone) => {
              setNotice({ tone, text });
              router.refresh();
            }}
          />
        ) : null}
        {rubricCount === 0 ? (
          <p className="banner banner-warning" style={{ margin: 0 }}>
            <AlertIcon /> Add rubric criteria before judging starts.
          </p>
        ) : null}
        {standings.judges.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Judge</th>
                  <th>Scored</th>
                  <th>Mean</th>
                  <th>Spread</th>
                  <th>Normalized against</th>
                </tr>
              </thead>
              <tbody>
                {standings.judges.map((j) => (
                  <tr key={j.judge_id}>
                    <td>{j.name}</td>
                    <td className="mono">
                      {j.scored} / {j.assigned}
                    </td>
                    <td className="mono">{fmt(j.mean)}</td>
                    <td className="mono">{fmt(j.spread)}</td>
                    <td className="small">
                      {j.pooled ? 'All judges (too few scores)' : 'Own scores'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <StandingsTable standings={standings} completed={completed} />

      <AwardsPanel
        eventId={eventId}
        awards={awards}
        tracks={tracks}
        standings={standings}
        editable={judging}
        onDone={(text, tone) => {
          setNotice({ tone, text });
          router.refresh();
        }}
      />

      {judging ? (
        <p className="muted small" style={{ margin: 0 }}>
          When winners are chosen, publish results from the Overview with{' '}
          <strong>Mark completed</strong>. Results are then frozen: later changes can&apos;t alter
          them.
        </p>
      ) : null}
    </div>
  );
}

function AssignForm({
  eventId,
  hasAssignments,
  onDone,
}: {
  eventId: string;
  hasAssignments: boolean;
  onDone: (text: string, tone: 'success' | 'danger') => void;
}) {
  const [perSubmission, setPerSubmission] = useState(3);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await api<AssignJudgesResult>(`/events/${eventId}/judging/assign`, {
      method: 'POST',
      body: { judges_per_submission: perSubmission },
    });
    setBusy(false);
    if (!result.ok) return onDone(result.message, 'danger');
    const { judges, submissions, short } = result.data;
    const shortText =
      short.length > 0
        ? ` ${short.length} project${short.length === 1 ? '' : 's'} got fewer judges than asked: add judges under Staff.`
        : '';
    onDone(
      `Assigned ${judges} judge${judges === 1 ? '' : 's'} across ${submissions} project${submissions === 1 ? '' : 's'}.${shortText}`,
      short.length > 0 ? 'danger' : 'success',
    );
  }

  return (
    <form
      className="row"
      style={{ gap: 12, flexWrap: 'wrap', alignItems: 'end' }}
      onSubmit={submit}
    >
      <label className="field" style={{ maxWidth: 200 }}>
        <span className="label">Judges per project</span>
        <input
          className="input"
          type="number"
          min={1}
          max={10}
          value={perSubmission}
          onChange={(e) => setPerSubmission(Number(e.target.value))}
        />
      </label>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Assigning…' : hasAssignments ? 'Rebalance assignments' : 'Assign judges'}
      </button>
      <span className="muted small" style={{ flexBasis: '100%' }}>
        Balanced and random; nobody judges their own team. Running it again keeps anything already
        scored.
      </span>
    </form>
  );
}

function StandingsTable({ standings, completed }: { standings: Standings; completed: boolean }) {
  const [tab, setTab] = useState<string>('overall');
  const rows: StandingRow[] =
    tab === 'overall'
      ? standings.overall
      : (standings.tracks.find((t) => t.track_id === tab)?.rows ?? []);

  return (
    <section className="raised card stack" aria-labelledby="standings-title">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <h2 id="standings-title" className="h2">
          {completed ? 'Standings at publication' : 'Standings'}
        </h2>
        {standings.tracks.length > 0 ? (
          <div className="tabs" role="tablist" aria-label="Standings view">
            <button
              type="button"
              role="tab"
              className="tab"
              aria-selected={tab === 'overall'}
              onClick={() => setTab('overall')}
            >
              Overall
            </button>
            {standings.tracks.map((t) => (
              <button
                key={t.track_id}
                type="button"
                role="tab"
                className="tab"
                aria-selected={tab === t.track_id}
                onClick={() => setTab(t.track_id)}
              >
                {t.track_name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        <strong>Raw</strong> is the average weighted score out of 100. <strong>Normalized</strong>{' '}
        adjusts for generous and harsh judges (average z-score) and decides the order.
        {standings.tiebreaker ? ` Ties go to ${standings.tiebreaker}.` : ''}
      </p>
      {rows.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          No submitted projects yet.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Project</th>
                <th>Raw</th>
                <th>Normalized</th>
                <th>Judges</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.submission_id}>
                  <td className="mono">
                    {r.rank ?? '–'}
                    {r.tied ? ' (tie)' : ''}
                  </td>
                  <td>
                    <strong>{r.title || 'Untitled'}</strong>
                    <span className="muted small" style={{ display: 'block' }}>
                      {r.team_name}
                      {r.below_min_size ? ' · below minimum team size' : ''}
                    </span>
                  </td>
                  <td className="mono">{fmt(r.raw)}</td>
                  <td className="mono">{fmt(r.normalized, 2)}</td>
                  <td className="mono">
                    {r.judges_scored} / {r.judges_assigned}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AwardsPanel({
  eventId,
  awards,
  tracks,
  standings,
  editable,
  onDone,
}: {
  eventId: string;
  awards: AwardResult[];
  tracks: Track[];
  standings: Standings;
  editable: boolean;
  onDone: (text: string, tone: 'success' | 'danger') => void;
}) {
  if (awards.length === 0) {
    return (
      <div className="raised empty">
        <strong>No awards yet</strong>
        <span>Add awards under Tracks and schedule, then choose winners here.</span>
      </div>
    );
  }
  return (
    <section className="raised card stack" aria-labelledby="awards-title">
      <h2 id="awards-title" className="h2">
        Awards
      </h2>
      {awards.map((award) => (
        <AwardRow
          key={award.award_id}
          eventId={eventId}
          award={award}
          trackName={tracks.find((t) => t.id === award.track_id)?.name ?? null}
          candidates={
            award.track_id
              ? (standings.tracks.find((t) => t.track_id === award.track_id)?.rows ?? [])
              : standings.overall
          }
          editable={editable}
          onDone={onDone}
        />
      ))}
    </section>
  );
}

function AwardRow({
  eventId,
  award,
  trackName,
  candidates,
  editable,
  onDone,
}: {
  eventId: string;
  award: AwardResult;
  trackName: string | null;
  candidates: StandingRow[];
  editable: boolean;
  onDone: (text: string, tone: 'success' | 'danger') => void;
}) {
  const [selected, setSelected] = useState(award.winners.map((w) => w.team_id));
  const [busy, setBusy] = useState(false);
  const changed =
    [...selected].sort().join() !==
    award.winners
      .map((w) => w.team_id)
      .sort()
      .join();

  async function save() {
    setBusy(true);
    const result = await api(`/events/${eventId}/awards/${award.award_id}/winners`, {
      method: 'POST',
      body: { team_ids: selected },
    });
    setBusy(false);
    if (!result.ok) return onDone(result.message, 'danger');
    onDone(`Saved winners for ${award.name}.`, 'success');
  }

  return (
    <div className="inset card-tight stack-sm" style={{ borderRadius: 20 }}>
      <div className="row-between">
        <strong>
          {award.name}
          <span className="muted small"> {trackName ? `· ${trackName}` : '· Overall'}</span>
        </strong>
        {award.winners.length > 0 ? (
          <span className="chip chip-success">
            {award.winners.map((w) => w.team_name).join(', ')}
          </span>
        ) : (
          <span className="chip chip-muted">No winner yet</span>
        )}
      </div>
      {editable ? (
        <>
          <select
            className="select"
            multiple
            aria-label={`Winners of ${award.name}`}
            value={selected}
            onChange={(e) => setSelected([...e.target.selectedOptions].map((o) => o.value))}
            style={{ minHeight: 120, borderRadius: 20 }}
          >
            {candidates.map((r) => (
              <option key={r.team_id} value={r.team_id}>
                {r.rank ? `#${r.rank} ` : ''}
                {r.title || 'Untitled'} ({r.team_name})
              </option>
            ))}
          </select>
          <div className="row" style={{ gap: 12 }}>
            <button className="btn btn-sm" type="button" disabled={busy || !changed} onClick={save}>
              {busy ? 'Saving…' : 'Save winners'}
            </button>
            <span className="muted small">
              Ctrl or Cmd click to pick more than one (a shared award).
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

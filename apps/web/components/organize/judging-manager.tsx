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
import { AlertIcon, AwardIcon, CheckIcon } from '../icons';

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

/**
 * Organizer judging screen (screens PDF page 12, page type 04 Dashboard): a stat strip, then the
 * standings table that explains it, then judges and award winners.
 */
export function JudgingManager({ eventId, status, standings, awards, tracks, rubricCount }: Props) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const judging = status === 'judging';
  const completed = status === 'completed';
  const { scored, expected } = standings.progress;
  const waiting = standings.judges.filter((j) => j.scored < j.assigned);
  const tieGroups = groupTies(standings.overall);
  const percent = expected > 0 ? Math.round((scored / expected) * 100) : 0;
  const awardsByTeam = new Map<string, string[]>();
  for (const award of awards) {
    for (const winner of award.winners) {
      awardsByTeam.set(winner.team_id, [...(awardsByTeam.get(winner.team_id) ?? []), award.name]);
    }
  }
  const onDone = (text: string, tone: 'success' | 'danger') => {
    setNotice({ tone, text });
    router.refresh();
  };

  return (
    <>
      {notice ? (
        <p className={`banner banner-${notice.tone}`} role="status" style={{ margin: 0 }}>
          {notice.tone === 'success' ? <CheckIcon /> : <AlertIcon />} {notice.text}
        </p>
      ) : null}
      {rubricCount === 0 ? (
        <p className="banner banner-warning" style={{ margin: 0 }}>
          <AlertIcon /> Add rubric criteria before judging starts.
        </p>
      ) : null}

      <div className="stat-strip stat-strip-lead">
        <section className="band-dark stat" aria-labelledby="scores-in">
          <h2 id="scores-in" className="eyebrow">
            Scores in
          </h2>
          <span className="stat-value">
            {scored} <small>of {expected}</small>
          </span>
          <div
            className="meter"
            role="progressbar"
            aria-label="Scores in"
            aria-valuemin={0}
            aria-valuemax={expected}
            aria-valuenow={scored}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          <span className="small muted">
            {expected === 0
              ? 'Assign judges to start scoring.'
              : scored >= expected
                ? 'Every score is in.'
                : `${expected - scored} still to come.`}
          </span>
        </section>
        <section className="panel stat" aria-labelledby="waiting-on">
          <h2 id="waiting-on" className="eyebrow eyebrow-muted">
            Waiting on
          </h2>
          <span className="stat-value">
            {waiting.length} <small>{waiting.length === 1 ? 'judge' : 'judges'}</small>
          </span>
          <span className="small muted">
            {waiting.length === 0
              ? 'Nobody.'
              : waiting.map((j) => `${j.name} (${j.assigned - j.scored})`).join(', ')}
          </span>
        </section>
        <section className="panel stat" aria-labelledby="project-count">
          <h2 id="project-count" className="eyebrow eyebrow-muted">
            Projects
          </h2>
          <span className="stat-value">{standings.overall.length}</span>
          <span className="small muted">
            {tieGroups.length === 0
              ? 'No ties'
              : `${tieGroups.reduce((n, g) => n + g.length, 0)} tied`}
          </span>
        </section>
      </div>

      <StandingsTable
        standings={standings}
        completed={completed}
        trackName={new Map(tracks.map((t) => [t.id, t.name]))}
        awardsByTeam={awardsByTeam}
      />

      <div className="grid-2">
        <p
          className={tieGroups.length > 0 ? 'panel card small' : 'panel card small span-2'}
          style={{ margin: 0 }}
        >
          <strong>How adjusted scores work.</strong>{' '}
          <span className="muted">
            Each score is compared with that judge&apos;s own average and spread, so harsh and
            generous judges count equally. Raw is the average weighted score out of 100; the
            adjusted score decides the order.
          </span>
        </p>
        {tieGroups.length > 0 ? (
          <div className="callout callout-warning card small stack-sm">
            {tieGroups.map((group) => (
              <p key={group[0]?.submission_id} style={{ margin: 0 }}>
                <strong>{joinNames(group.map((r) => r.title || 'Untitled'))} are tied.</strong>{' '}
                {standings.tiebreaker
                  ? `Tiebreaker criterion, ${standings.tiebreaker}: ${group
                      .map((r) => `${r.title || 'Untitled'} ${fmt(r.tiebreaker)}`)
                      .join(', ')}.`
                  : 'No tiebreaker criterion is set.'}{' '}
                Organizers make the final call.
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <section className="panel card stack" aria-labelledby="judges-title">
        <h2 id="judges-title" className="h2">
          Judges
        </h2>
        {judging ? (
          <AssignForm eventId={eventId} hasAssignments={expected > 0} onDone={onDone} />
        ) : null}
        {standings.judges.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Judge</th>
                  <th>Scored</th>
                  <th className="num">Mean</th>
                  <th className="num">Spread</th>
                  <th>Adjusted against</th>
                </tr>
              </thead>
              <tbody>
                {standings.judges.map((j) => (
                  <tr key={j.judge_id}>
                    <td>{j.name}</td>
                    <td className="mono">
                      {j.scored}/{j.assigned}
                    </td>
                    <td className="num">{fmt(j.mean)}</td>
                    <td className="num">{fmt(j.spread)}</td>
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

      <AwardsPanel
        eventId={eventId}
        awards={awards}
        tracks={tracks}
        standings={standings}
        editable={judging}
        onDone={onDone}
      />

      {judging ? (
        <p className="muted small" style={{ margin: 0 }}>
          When winners are chosen, publish results from the Overview with{' '}
          <strong>Mark completed</strong>. Results are then frozen: later changes can&apos;t alter
          them.
        </p>
      ) : null}
    </>
  );
}

/** Rows that share a rank, grouped: [[A, B], [C, D, E]]. */
function groupTies(rows: StandingRow[]): StandingRow[][] {
  const byRank = new Map<number, StandingRow[]>();
  for (const row of rows) {
    if (!row.tied || row.rank === null) continue;
    byRank.set(row.rank, [...(byRank.get(row.rank) ?? []), row]);
  }
  return [...byRank.values()].filter((group) => group.length > 1);
}

/** "A and B", "A, B and C". */
function joinNames(names: string[]): string {
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** "+1.38", "-0.41": the sign matters for an adjusted score. */
function signed(n: number | null): string {
  if (n === null) return '–';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}`;
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
    <form className="row" style={{ gap: 12, alignItems: 'end' }} onSubmit={submit}>
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

function StandingsTable({
  standings,
  completed,
  trackName,
  awardsByTeam,
}: {
  standings: Standings;
  completed: boolean;
  trackName: Map<string, string>;
  awardsByTeam: Map<string, string[]>;
}) {
  const [tab, setTab] = useState<string>('overall');
  const rows: StandingRow[] =
    tab === 'overall'
      ? standings.overall
      : (standings.tracks.find((t) => t.track_id === tab)?.rows ?? []);

  return (
    <section className="panel" aria-labelledby="standings-title">
      <div className="card stack-sm" style={{ paddingBottom: 0 }}>
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
      {rows.length === 0 ? (
        <p className="muted card" style={{ margin: 0 }}>
          No submitted projects yet.
        </p>
      ) : (
        <div className="table-wrap" style={{ border: 0, borderTop: '1px solid var(--line)' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Project</th>
                <th>Tracks</th>
                <th>Judges</th>
                <th className="num">Raw avg</th>
                <th className="num">Adjusted</th>
                <th>Award</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const missing = r.judges_assigned - r.judges_scored;
                const won = awardsByTeam.get(r.team_id) ?? [];
                return (
                  <tr key={r.submission_id}>
                    <td
                      className="mono"
                      style={{ color: r.rank === 1 ? 'var(--green)' : undefined }}
                    >
                      {r.rank ?? '–'}
                    </td>
                    <td>
                      <strong>{r.title || 'Untitled'}</strong>
                      {r.tied ? (
                        <>
                          {' '}
                          <span className="chip chip-warning">Tied</span>
                        </>
                      ) : null}
                      <span className="sub">
                        {r.team_name}
                        {r.below_min_size ? ' · below minimum team size' : ''}
                      </span>
                    </td>
                    <td className="small">
                      {r.track_ids.map((id) => trackName.get(id) ?? '').join(', ') || '–'}
                    </td>
                    <td
                      className="mono"
                      style={{ color: missing > 0 ? 'var(--warning)' : undefined }}
                    >
                      {r.judges_scored}/{r.judges_assigned}
                    </td>
                    <td className="num muted">{fmt(r.raw)}</td>
                    <td className="num">
                      {missing > 0 && r.normalized === null ? (
                        <span className="muted small" style={{ fontFamily: 'var(--font-body)' }}>
                          Waiting for {missing} {missing === 1 ? 'score' : 'scores'}
                        </span>
                      ) : (
                        <strong>{signed(r.normalized)}</strong>
                      )}
                    </td>
                    <td>
                      {won.length > 0 ? (
                        <span className="chip chip-success">
                          <AwardIcon width={12} height={12} /> {won.join(', ')}
                        </span>
                      ) : (
                        <span className="muted small">–</span>
                      )}
                    </td>
                  </tr>
                );
              })}
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
      <div className="panel empty">
        <strong>No awards yet</strong>
        <span>Add awards under Tracks and schedule, then choose winners here.</span>
      </div>
    );
  }
  return (
    <section className="panel card stack" aria-labelledby="awards-title">
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
    <div className="well card-tight stack-sm">
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
            style={{ minHeight: 120 }}
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

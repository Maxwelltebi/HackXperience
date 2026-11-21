'use client';

import {
  DECISION_EMAIL_DELAY_MINUTES,
  formatDateTime,
  type ApplicationListItem,
  type ApplicationListResponse,
  type ApplicationQuestion,
  type ApplicationStatus,
  type DecisionStatus,
  type DecisionsResponse,
} from '@hx/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { APPLICATION_STATUS, chipClass, type Tone } from '@/lib/ui/status';
import { AlertIcon, CheckIcon, SearchIcon } from '../icons';
import styles from './applications-review.module.css';

type Filter = ApplicationStatus | 'all';

const TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'waitlisted', label: 'Waitlisted' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'declined', label: 'Declined' },
];

const DECISIONS: { status: DecisionStatus; label: string; className: string }[] = [
  { status: 'accepted', label: 'Accept', className: 'btn btn-primary btn-sm' },
  { status: 'waitlisted', label: 'Waitlist', className: 'btn btn-sm' },
  { status: 'rejected', label: 'Reject', className: 'btn btn-danger btn-sm' },
];

const DECIDED_WORD: Record<DecisionStatus, string> = {
  accepted: 'Accepted',
  waitlisted: 'Waitlisted',
  rejected: 'Rejected',
};

interface Props {
  eventId: string;
  eventName: string;
  eventBadge: { label: string; tone: Tone };
  /** The application form editor, for organizers who can edit the event. */
  questionsHref: string | null;
  questions: ApplicationQuestion[];
  timezone: string;
  initial: ApplicationListResponse;
}

/**
 * The organizer review screen (screens PDF page 11, page type 03 List and table): tabs, search,
 * a dark bulk bar, the table and a side panel. Server data refetches after each decision.
 */
export function ApplicationsReview({
  eventId,
  eventName,
  eventBadge,
  questionsHref,
  questions,
  timezone,
  initial,
}: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('submitted');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(initial.items[0]?.id ?? null);
  const [loading, setLoading] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const firstRender = useRef(true);

  async function load(nextFilter: Filter, q: string, cursor?: string) {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (nextFilter !== 'all') params.set('status', nextFilter);
    if (q.trim()) params.set('q', q.trim());
    if (cursor) params.set('cursor', cursor);
    const result = await api<ApplicationListResponse>(`/events/${eventId}/applications?${params}`);
    setLoading(false);
    if (!result.ok) {
      setNotice({ tone: 'danger', text: result.message });
      return;
    }
    setData((current) =>
      cursor ? { ...result.data, items: [...current.items, ...result.data.items] } : result.data,
    );
    if (!cursor) {
      setSelected(new Set());
      setActiveId(result.data.items[0]?.id ?? null);
    }
  }

  // Refetch when the tab or search changes (search waits for typing to pause).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = window.setTimeout(() => void load(filter, search), search ? 300 : 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is recreated each render
  }, [filter, search]);

  async function decide(ids: string[], status: DecisionStatus) {
    setDeciding(true);
    setNotice(null);
    const result = await api<DecisionsResponse>(`/events/${eventId}/applications/decisions`, {
      method: 'POST',
      body: { application_ids: ids, status },
    });
    setDeciding(false);
    if (!result.ok) {
      setNotice({ tone: 'danger', text: result.message });
      return;
    }
    const { updated, skipped } = result.data;
    const parts = [
      `${DECIDED_WORD[status]} ${updated.length}.`,
      updated.length > 0 ? `Emails go out in ${DECISION_EMAIL_DELAY_MINUTES} minutes.` : '',
      skipped.length > 0 ? `${skipped.length} skipped: the applicant already replied.` : '',
    ];
    setNotice({ tone: 'success', text: parts.filter(Boolean).join(' ') });
    await load(filter, search);
    router.refresh(); // sidebar count
  }

  const items = data.items;
  const active = items.find((item) => item.id === activeId) ?? null;
  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <div className="page-head">
        <div>
          <p className="crumb">
            {eventName} <span className={chipClass(eventBadge.tone)}>{eventBadge.label}</span>
          </p>
          <h1 className="h1">Applications</h1>
        </div>
        {questionsHref ? (
          <Link className="btn" href={questionsHref}>
            Edit questions
          </Link>
        ) : null}
        <div className="tabs" role="tablist" aria-label="Filter by status">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              className="tab"
              aria-selected={filter === tab.key}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}{' '}
              <span className="count">
                {tab.key === 'all' ? data.counts.all : data.counts[tab.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <label className={styles.search}>
        <SearchIcon className={styles.searchIcon} />
        <span className="visually-hidden">Search name, email or school</span>
        <input
          className="input"
          type="search"
          placeholder="Search name, email or school"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>

      <div className="band-dark bulk-bar">
        <span className="count small">
          <b>{selected.size}</b> selected
        </span>
        {DECISIONS.map((d) => (
          <button
            key={d.status}
            type="button"
            className={d.className}
            disabled={selected.size === 0 || deciding}
            onClick={() => void decide([...selected], d.status)}
          >
            {d.label}
          </button>
        ))}
        <span className={`small ${styles.bulkNote}`}>
          Emails go out {DECISION_EMAIL_DELAY_MINUTES} minutes after a decision. Change it before
          then and only the final one is sent.
        </span>
      </div>

      {notice ? (
        <p className={`banner banner-${notice.tone}`} role="status" style={{ margin: 0 }}>
          {notice.tone === 'success' ? <CheckIcon /> : <AlertIcon />} {notice.text}
        </p>
      ) : null}

      <div className={styles.layout}>
        <div className="panel">
          {items.length === 0 ? (
            <div className="empty">
              <strong>{loading ? 'Loading…' : 'No applications here'}</strong>
              {!loading && search ? <span>Try a different search.</span> : null}
            </div>
          ) : (
            <div className={`table-wrap ${styles.tableWrap}`}>
              <table className="table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select all shown"
                        checked={allSelected}
                        onChange={() =>
                          setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))
                        }
                      />
                    </th>
                    <th>Applicant</th>
                    <th>School</th>
                    <th>Level</th>
                    <th>Applied ({shortZone(timezone)})</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <Row
                      key={item.id}
                      item={item}
                      timezone={timezone}
                      selected={selected.has(item.id)}
                      active={item.id === activeId}
                      onToggle={() => toggle(item.id)}
                      onOpen={() => setActiveId(item.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="row-between" style={{ padding: '12px 16px' }}>
            <span className="muted small">
              Showing {items.length} of {filter === 'all' ? data.counts.all : data.counts[filter]}
            </span>
            {data.next_cursor ? (
              <button
                type="button"
                className="btn btn-sm"
                disabled={loading}
                onClick={() => void load(filter, search, data.next_cursor ?? undefined)}
              >
                {loading ? 'Loading…' : 'Load more'}
              </button>
            ) : null}
          </div>
        </div>

        {active ? (
          <Detail
            item={active}
            questions={questions}
            timezone={timezone}
            busy={deciding}
            onDecide={(status) => void decide([active.id], status)}
          />
        ) : null}
      </div>
    </>
  );
}

/** The zone's short name for a table heading, such as "GMT". */
function shortZone(timezone: string): string {
  const part = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, timeZoneName: 'short' })
    .formatToParts(new Date())
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? timezone;
}

/** "16 Nov 09:14": the column heading carries the zone. */
function formatShort(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(iso))
    .replace(',', '');
}

function Row({
  item,
  timezone,
  selected,
  active,
  onToggle,
  onOpen,
}: {
  item: ApplicationListItem;
  timezone: string;
  selected: boolean;
  active: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const status = APPLICATION_STATUS[item.status];
  return (
    <tr data-selected={selected} data-active={active && !selected}>
      <td>
        <input
          type="checkbox"
          aria-label={`Select ${item.name}`}
          checked={selected}
          onChange={onToggle}
        />
      </td>
      <td>
        <button type="button" className={styles.nameButton} onClick={onOpen}>
          <strong>{item.name || 'No name'}</strong>
          <span className="sub">{item.email}</span>
        </button>
      </td>
      <td>{item.school ?? <span className="muted">—</span>}</td>
      <td>{item.level_of_study ?? <span className="muted">—</span>}</td>
      <td className="mono small" style={{ whiteSpace: 'nowrap' }}>
        {formatShort(item.created_at, timezone)}
      </td>
      <td>
        <span className={chipClass(status.tone)}>{status.label}</span>
      </td>
    </tr>
  );
}

function Detail({
  item,
  questions,
  timezone,
  busy,
  onDecide,
}: {
  item: ApplicationListItem;
  questions: ApplicationQuestion[];
  timezone: string;
  busy: boolean;
  onDecide: (status: DecisionStatus) => void;
}) {
  const status = APPLICATION_STATUS[item.status];
  const decided = item.status === 'confirmed' || item.status === 'declined';
  return (
    <aside
      className={`panel card stack ${styles.detail}`}
      aria-label={`Application from ${item.name}`}
    >
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2 className="h2">{item.name || 'No name'}</h2>
          <span className="muted small">{item.email}</span>
        </div>
        <span className={chipClass(status.tone)}>{status.label}</span>
      </div>

      <dl className="dl">
        <div>
          <dt>School</dt>
          <dd>{item.school ?? '—'}</dd>
        </div>
        <div>
          <dt>Level</dt>
          <dd>{item.level_of_study ?? '—'}</dd>
        </div>
        <div>
          <dt>Country</dt>
          <dd>{item.country ?? '—'}</dd>
        </div>
        <div>
          <dt>Applied</dt>
          <dd className="mono small">{formatDateTime(item.created_at, timezone)}</dd>
        </div>
      </dl>

      {questions.map((question) => {
        const answer = item.answers[question.id];
        if (answer === undefined) return null;
        const text = Array.isArray(answer) ? answer.join(', ') : answer;
        return (
          <div key={question.id} className="stack-sm" style={{ gap: 4 }}>
            <strong className="small">{question.label}</strong>
            {question.type === 'url' ? (
              <a
                href={text}
                target="_blank"
                rel="noreferrer noopener"
                style={{ overflowWrap: 'anywhere' }}
              >
                {text}
              </a>
            ) : (
              <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>
            )}
          </div>
        );
      })}

      {item.github_username ? (
        <div className="stack-sm" style={{ gap: 4 }}>
          <strong className="small">GitHub profile</strong>
          <a
            href={`https://github.com/${item.github_username}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            github.com/{item.github_username}
          </a>
        </div>
      ) : null}

      {decided ? (
        <p className="muted small" style={{ margin: 0 }}>
          The applicant has {item.status} their place, so the decision is theirs now.
        </p>
      ) : (
        <>
          <div className="row">
            {DECISIONS.map((d) => (
              <button
                key={d.status}
                type="button"
                className={d.className}
                aria-pressed={item.status === d.status}
                disabled={busy || item.status === d.status}
                onClick={() => onDecide(d.status)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="hint" style={{ margin: 0 }}>
            {item.decided_at
              ? `Decided ${formatDateTime(item.decided_at, timezone)}.`
              : 'No decision yet.'}{' '}
            Every decision is recorded in the audit log.
          </p>
        </>
      )}
    </aside>
  );
}

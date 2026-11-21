import { eventImpact, getSql } from '@hx/db';
import { API_PREFIX, can, type ImpactFigures } from '@hx/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadOrganizerEvent } from '@/lib/server/organize';

export const metadata: Metadata = { title: 'Impact report' };

const pct = (n: number | null) => (n === null ? '–' : `${Math.round(n * 100)}%`);

/** The impact report for grant applications (build plan Phase 7 item 3), with a CSV download. */
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access } = await loadOrganizerEvent(id);
  if (!can(access.roles, 'reports.read')) notFound();
  const report = await eventImpact(getSql(), id);

  const overview: [string, string][] = [
    ['Applied', `${report.applicants}`],
    ['Offered a place', `${report.accepted}`],
    ['Confirmed', `${report.confirmed}`],
    ['Checked in', `${report.checked_in}`],
    ['Teams', `${report.teams}`],
    ['Projects submitted', `${report.submissions}`],
    ['Completion rate', pct(report.completion_rate)],
    ['Mentor requests', `${report.mentor_requests} (${report.mentor_resolved} resolved)`],
    [
      'Median wait for a mentor',
      report.median_response_minutes === null ? '–' : `${report.median_response_minutes} min`,
    ],
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <p className="crumb">{access.event.name}</p>
          <h1 className="h1">Impact report</h1>
          <p className="muted small" style={{ margin: '6px 0 0' }}>
            Demographics count checked-in participants only. Deleted teams and projects never count.
          </p>
        </div>
        <a
          className="btn btn-primary"
          href={`${API_PREFIX}/events/${id}/reports/impact?format=csv`}
        >
          Download CSV
        </a>
      </div>
      <section className="raised card" aria-label="Overview">
        <dl className="dl">
          {overview.map(([label, value]) => (
            <div key={label} style={{ display: 'contents' }}>
              <dt>{label}</dt>
              <dd className="mono">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="grid-2">
        {(
          [
            ['School', 'school'],
            ['Level of study', 'level_of_study'],
            ['Country', 'country'],
            ['Gender', 'gender'],
          ] as [string, keyof ImpactFigures['demographics']][]
        ).map(([label, key]) => (
          <section key={key} className="raised card stack-sm" aria-label={label}>
            <h2 className="h2" style={{ fontSize: 18 }}>
              {label}
            </h2>
            {report.demographics[key].length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>
                No check-ins yet.
              </p>
            ) : (
              report.demographics[key].map((row) => (
                <div key={row.value} className="row-between small">
                  <span>{row.value}</span>
                  <span className="mono">{row.count}</span>
                </div>
              ))
            )}
          </section>
        ))}
      </div>
    </>
  );
}

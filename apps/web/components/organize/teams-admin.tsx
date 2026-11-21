'use client';

import type { OrganizerTeam } from '@hx/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { AlertIcon } from '../icons';

/** Teams table with soft delete and restore for owners. */
export function TeamsAdmin({
  eventId,
  teams,
  canDelete,
}: {
  eventId: string;
  teams: OrganizerTeam[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, path: string, method: 'DELETE' | 'POST', confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key);
    const result = await api(path, { method });
    setBusy(null);
    setError(result.ok ? null : result.message);
    router.refresh();
  }

  if (teams.length === 0) {
    return (
      <div className="panel empty">
        <strong>No teams yet</strong>
        <span>Teams appear here as confirmed participants form them.</span>
      </div>
    );
  }

  return (
    <div className="stack">
      {error ? (
        <p className="banner banner-danger" role="alert" style={{ margin: 0 }}>
          <AlertIcon /> {error}
        </p>
      ) : null}
      <div className="panel table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Team</th>
              <th>Members</th>
              <th>Project</th>
              {canDelete ? <th aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const s = t.submission;
              return (
                <tr key={t.id} style={t.deleted_at ? { opacity: 0.6 } : undefined}>
                  <td>
                    <strong>{t.name}</strong>
                    {t.deleted_at ? (
                      <span className="chip chip-danger" style={{ marginLeft: 8 }}>
                        Deleted
                      </span>
                    ) : null}
                  </td>
                  <td className="small">{t.members.join(', ') || '–'}</td>
                  <td className="small">
                    {s ? (
                      <>
                        {s.title || 'Untitled'}{' '}
                        <span
                          className={`chip chip-${s.deleted_at ? 'danger' : s.status === 'submitted' ? 'success' : 'warning'}`}
                        >
                          {s.deleted_at
                            ? 'Deleted'
                            : s.status === 'submitted'
                              ? 'Submitted'
                              : 'Draft'}
                        </span>
                      </>
                    ) : (
                      <span className="muted">None</span>
                    )}
                  </td>
                  {canDelete ? (
                    <td>
                      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        {t.deleted_at ? (
                          <button
                            className="btn btn-sm"
                            type="button"
                            disabled={busy !== null}
                            onClick={() =>
                              run(t.id, `/events/${eventId}/teams/${t.id}/restore`, 'POST')
                            }
                          >
                            Restore team
                          </button>
                        ) : (
                          <button
                            className="btn btn-sm btn-danger"
                            type="button"
                            disabled={busy !== null}
                            onClick={() =>
                              run(
                                t.id,
                                `/events/${eventId}/teams/${t.id}`,
                                'DELETE',
                                `Delete ${t.name}? Its project leaves judging and the gallery. You can restore it.`,
                              )
                            }
                          >
                            Delete team
                          </button>
                        )}
                        {s && !t.deleted_at ? (
                          s.deleted_at ? (
                            <button
                              className="btn btn-sm"
                              type="button"
                              disabled={busy !== null}
                              onClick={() =>
                                run(s.id, `/events/${eventId}/submissions/${s.id}/restore`, 'POST')
                              }
                            >
                              Restore project
                            </button>
                          ) : (
                            <button
                              className="btn btn-sm btn-danger"
                              type="button"
                              disabled={busy !== null}
                              onClick={() =>
                                run(
                                  s.id,
                                  `/events/${eventId}/submissions/${s.id}`,
                                  'DELETE',
                                  `Delete the project “${s.title || 'Untitled'}”? You can restore it.`,
                                )
                              }
                            >
                              Delete project
                            </button>
                          )
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

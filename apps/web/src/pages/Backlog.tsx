import { useState } from 'react';
import { api, useApi } from '../api';
import { ErrorNote, StatusBadge } from '../components/common';
import type { JiraStatus, SyncResult, WorkItem } from '../types';

export function BacklogPage() {
  const backlog = useApi<WorkItem[]>('/api/v1/backlog');
  const jira = useApi<JiraStatus>('/api/v1/jira/status');
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult>();

  async function sync(mode: 'MANUAL' | 'INCREMENTAL') {
    setSyncing(true);
    try {
      const result = await api.post<SyncResult>('/api/v1/jira/sync', { mode });
      setLastSync(result);
      backlog.reload();
      jira.reload();
    } finally {
      setSyncing(false);
    }
  }

  if (backlog.error) return <ErrorNote error={backlog.error} />;

  return (
    <>
      <div className="card">
        <div className="row between">
          <div>
            <div className="section-title">JIRA Synchronization</div>
            <div className="sub" style={{ marginTop: 4 }}>
              {jira.data?.connection.connected ? (
                <>
                  <span className="badge good">connected</span> {jira.data.connection.baseUrl} · projects {jira.data.connection.projectKeys.join(', ')} ·{' '}
                  {jira.data.connection.direction} · schedule {jira.data.connection.scheduleCron} · last sync{' '}
                  {jira.data.connection.lastSyncAt ? new Date(jira.data.connection.lastSyncAt).toLocaleTimeString() : 'never'}
                </>
              ) : (
                'Not connected'
              )}
            </div>
          </div>
          <div className="row">
            <button className="btn" disabled={syncing} onClick={() => sync('INCREMENTAL')}>
              Incremental Sync
            </button>
            <button className="btn primary" disabled={syncing} onClick={() => sync('MANUAL')}>
              {syncing ? 'Syncing…' : '⟳ Sync with JIRA'}
            </button>
          </div>
        </div>
        {lastSync && (
          <div className="sub" style={{ marginTop: 8 }}>
            Last run: {lastSync.pulled} pulled · {lastSync.updated} updated · {lastSync.pushed} pushed · {lastSync.conflicts.length} conflicts
          </div>
        )}
      </div>

      <div className="card">
        <h3>Backlog ({backlog.data?.length ?? 0})</h3>
        <table className="data">
          <thead>
            <tr>
              <th>Key</th>
              <th>Title</th>
              <th>Stage</th>
              <th className="num">Points</th>
              <th>AC</th>
              <th>Labels</th>
            </tr>
          </thead>
          <tbody>
            {(backlog.data ?? []).map((item) => (
              <tr key={item.id}>
                <td>
                  <strong style={{ color: 'var(--text-primary)' }}>{item.jiraKey}</strong>
                </td>
                <td>{item.title}</td>
                <td>
                  <StatusBadge status={item.stage} />
                </td>
                <td className="num">{item.storyPoints ?? '—'}</td>
                <td className="num">{item.acceptanceCriteria.length}</td>
                <td>
                  {item.labels.map((label) => (
                    <span key={label} className="badge" style={{ marginRight: 4 }}>
                      {label}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

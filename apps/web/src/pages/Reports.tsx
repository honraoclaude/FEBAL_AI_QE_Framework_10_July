import { useApi } from '../api';
import { ErrorNote } from '../components/common';
import type { AuditEvent } from '../types';

interface Feedback {
  id: string;
  decisionId: string;
  outcome: string;
  reviewerId: string;
  reviewerComments?: string;
  createdAt: string;
}

export function ReportsPage() {
  const audit = useApi<AuditEvent[]>('/api/v1/audit?limit=100');
  const verify = useApi<{ intact: boolean }>('/api/v1/audit/verify');
  const feedback = useApi<Feedback[]>('/api/v1/feedback');

  if (audit.error) return <ErrorNote error={audit.error} />;

  return (
    <>
      <div className="card">
        <div className="row between">
          <div>
            <div className="section-title">Immutable Audit Trail</div>
            <div className="sub" style={{ marginTop: 4 }}>
              Hash-chained, tamper-evident record of every agent decision, approval, sync and configuration change.
            </div>
          </div>
          <div className="row">
            {verify.data && (
              <span className={`badge ${verify.data.intact ? 'good' : 'critical'}`}>
                {verify.data.intact ? '✓ chain intact' : '✗ chain broken'}
              </span>
            )}
            <a className="btn" href="/api/v1/audit/export" download>
              ⤓ Export for compliance
            </a>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Recent Events ({audit.data?.length ?? 0})</h3>
        <table className="data">
          <thead>
            <tr>
              <th className="num">Seq</th>
              <th>Kind</th>
              <th>Actor</th>
              <th>Summary</th>
              <th>Time</th>
              <th>Hash</th>
            </tr>
          </thead>
          <tbody>
            {[...(audit.data ?? [])].reverse().map((event) => (
              <tr key={event.id}>
                <td className="num">{event.seq}</td>
                <td>
                  <span className="badge">{event.kind.replaceAll('_', ' ')}</span>
                </td>
                <td style={{ fontSize: 12 }}>{event.actor}</td>
                <td>{event.summary}</td>
                <td style={{ fontSize: 12 }}>{new Date(event.timestamp).toLocaleTimeString()}</td>
                <td style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{event.hash.slice(0, 10)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Recommendation Feedback ({feedback.data?.length ?? 0})</h3>
        {feedback.data && feedback.data.length > 0 ? (
          <table className="data">
            <thead>
              <tr>
                <th>Decision</th>
                <th>Outcome</th>
                <th>Reviewer</th>
                <th>Comments</th>
              </tr>
            </thead>
            <tbody>
              {feedback.data.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{entry.decisionId.slice(0, 12)}…</td>
                  <td>
                    <span className={`badge ${entry.outcome === 'ACCEPTED' ? 'good' : entry.outcome === 'REJECTED' ? 'critical' : 'warning'}`}>{entry.outcome}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{entry.reviewerId}</td>
                  <td style={{ fontSize: 12 }}>{entry.reviewerComments ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">No feedback recorded yet. Accept or reject agent decisions in the phase pages to close the learning loop.</div>
        )}
      </div>
    </>
  );
}

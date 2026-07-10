import { useApi } from '../api';
import { ErrorNote, StatusBadge } from '../components/common';
import type { Sprint, WorkItem } from '../types';

export function SprintPage() {
  const current = useApi<{ sprint: Sprint; items: WorkItem[] }>('/api/v1/sprints/current');
  if (current.error) return <ErrorNote error={current.error} />;
  if (!current.data) return <div className="empty">Loading sprint…</div>;
  const { sprint, items } = current.data;

  return (
    <>
      <div className="card">
        <div className="row between">
          <div>
            <div className="section-title">{sprint.name}</div>
            <div className="sub" style={{ marginTop: 4 }}>
              <strong>Sprint goal:</strong> {sprint.goal}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="badge accent">{sprint.state}</span>
            <div className="sub" style={{ marginTop: 6 }}>
              {sprint.startDate} → {sprint.endDate}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Sprint Items ({items.length})</h3>
        <table className="data">
          <thead>
            <tr>
              <th>Key</th>
              <th>Title</th>
              <th>Type</th>
              <th>Stage</th>
              <th className="num">Points</th>
              <th>AC</th>
              <th>Links</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong style={{ color: 'var(--text-primary)' }}>{item.jiraKey}</strong>
                </td>
                <td>{item.title}</td>
                <td>{item.type === 'BUG' ? <span className="badge critical">BUG</span> : item.type}</td>
                <td>
                  <StatusBadge status={item.stage} />
                </td>
                <td className="num">{item.storyPoints ?? '—'}</td>
                <td className="num">{item.acceptanceCriteria.length}</td>
                <td style={{ fontSize: 12 }}>
                  {item.linkedPullRequests.map((pr) => (
                    <span key={pr} className="badge" style={{ marginRight: 4 }}>
                      {pr}
                    </span>
                  ))}
                  {item.linkedDefectKeys.map((defect) => (
                    <span key={defect} className="badge serious" style={{ marginRight: 4 }}>
                      {defect}
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

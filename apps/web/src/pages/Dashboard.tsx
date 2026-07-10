import { useRef } from 'react';
import { useApi, useEventStream } from '../api';
import { LineChart, Meter, ProgressBar, Sparkline } from '../components/charts';
import { ErrorNote, StatTile } from '../components/common';
import type { AgentHealth, ApprovalRequest, DashboardSnapshot } from '../types';

export function Dashboard() {
  const snapshot = useApi<DashboardSnapshot>('/api/v1/dashboard');
  const approvals = useApi<ApprovalRequest[]>('/api/v1/approvals?status=REVIEW');
  const health = useApi<AgentHealth[]>('/api/v1/agents/health');

  // Live refresh: workflow/approval/sync activity re-computes the dashboard.
  const debounceRef = useRef<number>();
  useEventStream((event) => {
    if (!/^(workflow|approval|jira|decision)\./.test(event.topic)) return;
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      snapshot.reload();
      approvals.reload();
      health.reload();
    }, 300);
  });

  if (snapshot.error) return <ErrorNote error={snapshot.error} />;
  const d = snapshot.data;
  if (!d) return <div className="empty">Loading dashboard…</div>;

  return (
    <>
      <div className="grid cols-4">
        <StatTile label="AI Health" value={<Meter value={d.aiHealth} />} badge={<span className="badge accent">{d.activeAgents} agents</span>} />
        <StatTile label="Sprint Health" value={<Meter value={d.sprintHealth} />} />
        <StatTile label="Release Health" value={<Meter value={d.releaseHealth} />} />
        <StatTile label="Compliance" value={<Meter value={d.compliance} />} badge={<span className="badge good">FCA · Consumer Duty</span>} />
      </div>

      <div className="grid cols-4">
        <StatTile label="Quality Score" value={d.qualityScore} unit="/100">
          <Sparkline points={d.qualityTrend} />
        </StatTile>
        <StatTile label="Automation" value={`${d.automationPercent}%`}>
          <Sparkline points={d.automationTrend} color="var(--series-2)" />
        </StatTile>
        <StatTile label="Risk Score" value={d.riskScore} unit="/100" badge={d.riskScore > 50 ? <span className="badge serious">elevated</span> : <span className="badge good">managed</span>} />
        <StatTile label="Production Stability" value={`${d.productionStability}%`} badge={<span className="badge good">99.9% SLO</span>} />
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Story Progress — Sprint 24</h3>
          <div style={{ marginTop: 12 }}>
            <ProgressBar
              total={d.storyProgress.total}
              segments={[
                { label: 'Done', value: d.storyProgress.done, color: 'var(--series-2)' },
                { label: 'In Test', value: d.storyProgress.inTest, color: 'var(--series-1)' },
                { label: 'In Dev', value: d.storyProgress.inDev, color: 'var(--series-5)' },
                { label: 'Refined', value: Math.max(d.storyProgress.refined - d.storyProgress.inDev - d.storyProgress.inTest - d.storyProgress.done, 0), color: 'var(--series-3)' },
                { label: 'Remaining', value: Math.max(d.storyProgress.total - d.storyProgress.refined, 0), color: 'var(--surface-3)' },
              ]}
            />
          </div>
        </div>
        <div className="card">
          <h3>Pending Approvals</h3>
          {approvals.data && approvals.data.length > 0 ? (
            <table className="data">
              <tbody>
                {approvals.data.slice(0, 4).map((approval) => (
                  <tr key={approval.id}>
                    <td>{approval.title}</td>
                    <td>
                      <span className="badge warning">{approval.type}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">No approvals waiting — the pipeline is clear.</div>
          )}
          <div className="sub" style={{ marginTop: 6 }}>
            {d.pendingApprovals} total pending · resolve in the phase pages
          </div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Defect Trend</h3>
          <LineChart series={[{ name: 'Open defects', points: d.defectTrend }]} />
        </div>
        <div className="card">
          <h3>Quality & Automation Trend</h3>
          <LineChart
            series={[
              { name: 'Quality score', points: d.qualityTrend },
              { name: 'Automation %', points: d.automationTrend },
            ]}
          />
        </div>
      </div>

      <div className="card">
        <h3>Agent Status</h3>
        <div className="row" style={{ marginTop: 8, gap: 8 }}>
          <span className="badge good">{(health.data ?? []).filter((h) => h.status === 'IDLE').length} healthy</span>
          <span className="badge accent">{(health.data ?? []).filter((h) => h.status === 'RUNNING').length} running</span>
          <span className="badge warning">{(health.data ?? []).filter((h) => h.status === 'DEGRADED').length} degraded</span>
          <span className="badge critical">{(health.data ?? []).filter((h) => h.status === 'ERROR').length} error</span>
          <span className="spacer" />
          <a href="/agents">View all agents →</a>
        </div>
      </div>
    </>
  );
}

import { useMemo, useState } from 'react';
import { api, useApi } from '../api';
import { DecisionCard, ErrorNote, Pipeline, StatusBadge } from '../components/common';
import type { AgentDecision, ApprovalRequest, WorkItem, WorkflowDefinition, WorkflowRun } from '../types';

/**
 * Generic phase workspace: pick a subject, run the phase workflow, watch the
 * agent pipeline, review governed decisions, resolve human approvals inline.
 */
export function PhasePage({ workflowId, blurb }: { workflowId: string; blurb: string }) {
  const stories = useApi<WorkItem[]>('/api/v1/stories');
  const runs = useApi<WorkflowRun[]>('/api/v1/runs');
  const approvals = useApi<ApprovalRequest[]>('/api/v1/approvals?status=REVIEW');
  const workflows = useApi<WorkflowDefinition[]>('/api/v1/workflows');
  const [subjectId, setSubjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [selectedRunId, setSelectedRunId] = useState<string>();

  const definition = workflows.data?.find((w) => w.id === workflowId);
  const phaseRuns = useMemo(
    () => (runs.data ?? []).filter((run) => run.definitionId === workflowId).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [runs.data, workflowId],
  );
  const selectedRun = phaseRuns.find((run) => run.id === selectedRunId) ?? phaseRuns[0];
  const decisions = useApi<AgentDecision[]>(selectedRun ? `/api/v1/decisions?subjectId=${selectedRun.subjectId}` : '/api/v1/decisions', [selectedRun?.id, selectedRun?.status]);
  const runDecisions = (decisions.data ?? []).filter((d) => selectedRun?.steps.some((s) => s.decisionId === d.id));
  const pendingApprovals = (approvals.data ?? []).filter((a) => phaseRuns.some((run) => run.subjectId === a.subjectId));

  async function startRun() {
    if (!subjectId) return;
    setBusy(true);
    setError(undefined);
    try {
      const run = await api.post<WorkflowRun>(`/api/v1/workflows/${workflowId}/start`, { subjectId });
      setSelectedRunId(run.id);
      runs.reload();
      approvals.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start workflow');
    } finally {
      setBusy(false);
    }
  }

  async function resolveApproval(approvalId: string, status: 'APPROVED' | 'REJECTED') {
    setError(undefined);
    try {
      await api.post(`/api/v1/approvals/${approvalId}/resolve`, { status, comment: `${status} from ${workflowId} workspace` });
      runs.reload();
      approvals.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    }
  }

  async function feedback(decisionId: string, outcome: 'ACCEPTED' | 'REJECTED') {
    await api.post('/api/v1/feedback', { decisionId, outcome });
  }

  if (stories.error) return <ErrorNote error={stories.error} />;

  return (
    <>
      <div className="card">
        <div className="section-title">{definition?.name ?? workflowId}</div>
        <div className="sub" style={{ marginTop: 4 }}>{blurb}</div>
        <div className="row" style={{ marginTop: 12 }}>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={{ minWidth: 340 }}>
            <option value="">Select a work item…</option>
            {(stories.data ?? []).map((story) => (
              <option key={story.id} value={story.id}>
                {story.jiraKey} — {story.title}
              </option>
            ))}
          </select>
          <button className="btn primary" disabled={!subjectId || busy} onClick={startRun}>
            {busy ? 'Orchestrating…' : `▶ Run ${definition?.name ?? 'workflow'}`}
          </button>
        </div>
        {error && (
          <div className="sub" style={{ color: 'var(--status-critical)', marginTop: 8 }}>
            {error}
          </div>
        )}
      </div>

      {pendingApprovals.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(250,178,25,0.35)' }}>
          <h3>Human Approvals Required</h3>
          {pendingApprovals.map((approval) => (
            <div key={approval.id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>
              <div>
                <strong style={{ fontSize: 13 }}>{approval.title}</strong>
                <div className="sub">
                  {approval.type} · requires {approval.requiredRoles.join(' or ')} · requested by {approval.requestedBy}
                </div>
              </div>
              <div className="row">
                <button className="btn sm primary" onClick={() => resolveApproval(approval.id, 'APPROVED')}>
                  Approve
                </button>
                <button className="btn sm danger" onClick={() => resolveApproval(approval.id, 'REJECTED')}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid cols-2">
        <div className="card">
          <h3>Runs ({phaseRuns.length})</h3>
          {phaseRuns.length === 0 ? (
            <div className="empty">No runs yet. Select a work item and start the workflow.</div>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {phaseRuns.map((run) => (
                  <tr key={run.id} onClick={() => setSelectedRunId(run.id)} style={{ cursor: 'pointer', background: run.id === selectedRun?.id ? 'var(--surface-2)' : undefined }}>
                    <td>{(stories.data ?? []).find((s) => s.id === run.subjectId)?.jiraKey ?? run.subjectId}</td>
                    <td>
                      <StatusBadge status={run.status} />
                    </td>
                    <td style={{ fontSize: 12 }}>{new Date(run.startedAt).toLocaleTimeString()}</td>
                    <td style={{ fontSize: 12 }}>{run.triggeredBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3>Workflow Steps</h3>
          <div className="sub" style={{ marginBottom: 10 }}>
            {definition?.steps.length ?? 0} agents · gates pause for human approval
          </div>
          {selectedRun ? <Pipeline run={selectedRun} /> : <div className="empty">Select a run to see its pipeline.</div>}
        </div>
      </div>

      {selectedRun && (
        <div className="card">
          <h3>
            Agent Decisions — {(stories.data ?? []).find((s) => s.id === selectedRun.subjectId)?.jiraKey ?? selectedRun.subjectId}
          </h3>
          <div className="grid" style={{ marginTop: 10, gap: 10 }}>
            {runDecisions.length === 0 ? (
              <div className="empty">No decisions recorded for this run yet.</div>
            ) : (
              runDecisions.map((decision) => <DecisionCard key={decision.id} decision={decision} onFeedback={(outcome) => feedback(decision.id, outcome)} />)
            )}
          </div>
        </div>
      )}
    </>
  );
}

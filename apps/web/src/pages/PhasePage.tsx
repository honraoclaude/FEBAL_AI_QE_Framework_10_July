import { useMemo, useState } from 'react';
import { api, useApi } from '../api';
import { DecisionCard, ErrorNote, Pipeline, StatusBadge } from '../components/common';
import type { AgentDecision, ApprovalRequest, WorkItem, WorkflowDefinition, WorkflowRun } from '../types';

interface ThreeAmigosPayload {
  invest?: Record<string, { pass: boolean; note: string }>;
  definitionOfReadyPass?: boolean;
  verdict?: string;
  actions?: Array<{ role: string; action: string }>;
}

/**
 * Three Amigos INVEST panel: complete evaluation history for the subject with
 * on-demand re-evaluation. Every re-run is a new governed decision — nothing
 * is overwritten (spec: approve/reject/re-evaluate with tracked history).
 */
function ThreeAmigosHistory({
  subjectId,
  subjectLabel,
  decisions,
  onReevaluated,
}: {
  subjectId: string;
  subjectLabel: string;
  decisions: AgentDecision[];
  onReevaluated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const history = decisions
    .filter((d) => d.agentId === 'three-amigos')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function reevaluate() {
    setBusy(true);
    setError(undefined);
    try {
      await api.post(`/api/v1/agents/three-amigos/reevaluate`, { subjectId });
      onReevaluated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-evaluation failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="row between">
        <h3>Three Amigos — INVEST History ({history.length} evaluation{history.length === 1 ? '' : 's'}) · {subjectLabel}</h3>
        <button className="btn sm primary" disabled={busy} onClick={reevaluate} title="Re-run the Three Amigos workshop with fresh story data and the latest upstream analysis">
          {busy ? 'Re-evaluating…' : '↻ Re-evaluate INVEST'}
        </button>
      </div>
      {error && <div style={{ fontSize: 13, color: 'var(--status-critical)', marginTop: 8 }}>{error}</div>}
      {history.length === 0 ? (
        <div className="empty">No Three Amigos evaluation yet — run the refinement pipeline or click Re-evaluate.</div>
      ) : (
        <table className="data" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>When</th>
              <th>Verdict</th>
              <th>DoR</th>
              <th>INVEST</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {history.map((decision, index) => {
              const payload = decision.payload as ThreeAmigosPayload;
              return (
                <tr key={decision.id}>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {new Date(decision.createdAt).toLocaleTimeString()}
                    {index === 0 && <span className="badge accent" style={{ marginLeft: 6 }}>latest</span>}
                  </td>
                  <td>
                    <span className={`badge ${payload.verdict === 'APPROVED' ? 'good' : 'warning'}`}>{payload.verdict ?? '—'}</span>
                  </td>
                  <td>
                    <span className={`badge ${payload.definitionOfReadyPass ? 'good' : 'critical'}`}>{payload.definitionOfReadyPass ? 'pass' : 'fail'}</span>
                  </td>
                  <td>
                    {Object.entries(payload.invest ?? {}).map(([letter, check]) => (
                      <span key={letter} className={`badge ${check.pass ? 'good' : 'critical'}`} style={{ marginRight: 3 }} title={check.note}>
                        {letter[0]}
                      </span>
                    ))}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {(payload.actions ?? []).length > 0
                      ? (payload.actions ?? []).map((a, i) => (
                          <div key={i}>
                            <span className="badge" style={{ marginRight: 4 }}>{a.role}</span>
                            {a.action}
                          </div>
                        ))
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

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

      {workflowId === 'refinement' && selectedRun && (
        <ThreeAmigosHistory
          subjectId={selectedRun.subjectId}
          subjectLabel={(stories.data ?? []).find((s) => s.id === selectedRun.subjectId)?.jiraKey ?? selectedRun.subjectId}
          decisions={decisions.data ?? []}
          onReevaluated={() => {
            decisions.reload();
            runs.reload();
          }}
        />
      )}

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

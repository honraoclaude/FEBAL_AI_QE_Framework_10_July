import { useMemo, useRef, useState } from 'react';
import { api, useApi, useEventStream } from '../api';
import { DecisionCard, ErrorNote, StatusBadge } from '../components/common';
import type { AgentDecision, ApprovalRequest, StepRun, WorkItem, WorkflowDefinition, WorkflowRun } from '../types';

/**
 * Live Workflow — the full-lifecycle board for one work item: a column per
 * phase, a card per agent step with status, confidence and duration.
 */

const PHASE_COLUMNS: Array<{ workflowId: string; label: string }> = [
  { workflowId: 'refinement', label: 'Refinement' },
  { workflowId: 'development', label: 'Development' },
  { workflowId: 'testing', label: 'Testing' },
  { workflowId: 'release', label: 'Release' },
  { workflowId: 'deploy-learn', label: 'Deploy & Learn' },
];

function formatDuration(ms: number | undefined): string {
  if (ms === undefined || Number.isNaN(ms) || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function stepDuration(step: StepRun): number | undefined {
  if (!step.startedAt || !step.finishedAt) return undefined;
  return new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime();
}

function cardClass(status: string): string {
  if (status === 'COMPLETED') return 'SUCCEEDED';
  if (status === 'FAILED') return 'FAILED';
  if (status === 'AWAITING_APPROVAL') return 'AWAITING';
  if (status === 'RUNNING' || status === 'RETRYING') return 'RUNNING';
  return '';
}

function badgeFor(status: string) {
  const map: Record<string, [string, string]> = {
    COMPLETED: ['good', 'succeeded'],
    FAILED: ['critical', 'failed'],
    AWAITING_APPROVAL: ['warning', 'awaiting approval'],
    RUNNING: ['accent', 'running'],
    RETRYING: ['accent', 'retrying'],
    SKIPPED: ['', 'skipped'],
    PENDING: ['', 'pending'],
  };
  const [cls, label] = map[status] ?? ['', status.toLowerCase()];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function LiveWorkflowPage() {
  const stories = useApi<WorkItem[]>('/api/v1/stories');
  const runs = useApi<WorkflowRun[]>('/api/v1/runs');
  const workflows = useApi<WorkflowDefinition[]>('/api/v1/workflows');
  const approvals = useApi<ApprovalRequest[]>('/api/v1/approvals?status=REVIEW');
  const [subjectId, setSubjectId] = useState<string>();
  const [busyPhase, setBusyPhase] = useState<string>();
  const [selectedDecisionId, setSelectedDecisionId] = useState<string>();
  const [actionError, setActionError] = useState<string>();

  // Live updates: any workflow/approval event refreshes the board (debounced —
  // parallel steps can complete in bursts).
  const debounceRef = useRef<number>();
  const live = useEventStream((event) => {
    if (!event.topic.startsWith('workflow.') && !event.topic.startsWith('approval.')) return;
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      runs.reload();
      decisions.reload();
      approvals.reload();
    }, 120);
  });

  const allRuns = useMemo(() => [...(runs.data ?? [])].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [runs.data]);

  // Default subject: the story of the most recent run, else the first story.
  const effectiveSubjectId = subjectId ?? allRuns[0]?.subjectId ?? stories.data?.[0]?.id;
  const story = (stories.data ?? []).find((s) => s.id === effectiveSubjectId);

  const decisions = useApi<AgentDecision[]>(
    effectiveSubjectId ? `/api/v1/decisions?subjectId=${effectiveSubjectId}` : '/api/v1/decisions',
    [effectiveSubjectId, runs.data?.length, allRuns.map((r) => r.status).join()],
  );
  const decisionById = new Map((decisions.data ?? []).map((d) => [d.id, d]));

  // Latest run per phase for the selected subject.
  const latestRunByPhase = new Map<string, WorkflowRun>();
  for (const run of allRuns) {
    if (run.subjectId !== effectiveSubjectId) continue;
    if (!latestRunByPhase.has(run.definitionId)) latestRunByPhase.set(run.definitionId, run);
  }

  const phaseRuns = PHASE_COLUMNS.map((col) => latestRunByPhase.get(col.workflowId));
  const started = phaseRuns.filter((r): r is WorkflowRun => Boolean(r));
  const overallStatus =
    started.length === 0
      ? 'NOT STARTED'
      : started.some((r) => r.status === 'FAILED')
        ? 'FAILED'
        : started.some((r) => r.status === 'AWAITING_APPROVAL')
          ? 'AWAITING_APPROVAL'
          : started.some((r) => r.status === 'RUNNING' || r.status === 'PAUSED')
            ? 'RUNNING'
            : started.length === PHASE_COLUMNS.length
              ? 'COMPLETED'
              : 'IN PROGRESS';
  const totalMs = started.reduce((sum, run) => {
    const end = run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now();
    return sum + (end - new Date(run.startedAt).getTime());
  }, 0);

  // A pending approval freezes the subject: no further phases may start.
  const blockingRun = started.find((run) => run.status === 'AWAITING_APPROVAL');
  const blockingPhase = blockingRun ? PHASE_COLUMNS.find((c) => c.workflowId === blockingRun.definitionId)?.label : undefined;
  const blockingStep = blockingRun?.steps.find((s) => s.status === 'AWAITING_APPROVAL');
  const blockingApproval = (approvals.data ?? []).find((a) => a.subjectId === effectiveSubjectId);

  async function startPhase(workflowId: string) {
    if (!effectiveSubjectId) return;
    setBusyPhase(workflowId);
    setActionError(undefined);
    try {
      // Detached: the API returns immediately and the run streams in via SSE.
      await api.post(`/api/v1/workflows/${workflowId}/start`, { subjectId: effectiveSubjectId, detached: true });
      runs.reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to start workflow');
    } finally {
      setBusyPhase(undefined);
    }
  }

  async function resolveBlockingApproval(status: 'APPROVED' | 'REJECTED') {
    if (!blockingApproval) return;
    setActionError(undefined);
    try {
      await api.post(`/api/v1/approvals/${blockingApproval.id}/resolve`, { status, comment: `${status} from Live Workflow board` });
      runs.reload();
      approvals.reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Approval failed');
    }
  }

  if (stories.error) return <ErrorNote error={stories.error} />;

  const selectedDecision = selectedDecisionId ? decisionById.get(selectedDecisionId) : undefined;
  const gateStepIds = new Set(
    (workflows.data ?? []).flatMap((w) => w.steps.filter((s) => s.humanApproval).map((s) => `${w.id}:${s.id}`)),
  );

  return (
    <>
      <div className="card">
        <div className="row between">
          <div>
            <div className="section-title">Live Workflow</div>
            <div className="sub" style={{ marginTop: 4 }}>
              {story ? (
                <>
                  <strong style={{ color: 'var(--text-primary)' }}>{story.jiraKey}</strong> · {story.title}
                </>
              ) : (
                'Select a work item'
              )}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <StatusBadge status={overallStatus} />
              <span className="sub">agent time {formatDuration(totalMs || undefined)}</span>
              <span className="sub">
                {started.length}/{PHASE_COLUMNS.length} phases run
              </span>
              <span className={`badge ${live ? 'good' : 'warning'}`} title="Server-sent events connection">
                {live ? '● live' : '○ reconnecting…'}
              </span>
            </div>
          </div>
          <select
            value={effectiveSubjectId ?? ''}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setSelectedDecisionId(undefined);
            }}
            style={{ minWidth: 320 }}
          >
            {(stories.data ?? []).map((s) => {
              const phasesRun = allRuns.filter((r) => r.subjectId === s.id).length;
              return (
                <option key={s.id} value={s.id}>
                  {s.jiraKey} — {s.title.slice(0, 42)}
                  {phasesRun > 0 ? ` · ${phasesRun} run${phasesRun > 1 ? 's' : ''}` : ''}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {(blockingRun || actionError) && (
        <div className="card" style={{ borderColor: blockingRun ? 'rgba(250,178,25,0.45)' : 'rgba(208,59,59,0.45)' }}>
          {blockingRun && (
            <div className="row between">
              <div>
                <span className="badge warning">⛔ progression blocked</span>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{blockingPhase}</strong> is awaiting human approval
                  {blockingStep ? <> at <strong>{blockingStep.agentId}</strong></> : null}. No further agents can run for this work item until the
                  approval is resolved{blockingApproval ? <> — requires {blockingApproval.requiredRoles.join(' or ')}</> : null}.
                </div>
              </div>
              {blockingApproval && (
                <div className="row">
                  <button className="btn sm primary" onClick={() => resolveBlockingApproval('APPROVED')}>
                    Approve
                  </button>
                  <button className="btn sm danger" onClick={() => resolveBlockingApproval('REJECTED')}>
                    Reject
                  </button>
                </div>
              )}
            </div>
          )}
          {actionError && (
            <div style={{ fontSize: 13, color: 'var(--status-critical)', marginTop: blockingRun ? 10 : 0 }}>{actionError}</div>
          )}
        </div>
      )}

      <div className="board">
        {PHASE_COLUMNS.map((col, i) => {
          const run = phaseRuns[i];
          return (
            <div key={col.workflowId} className="board-col">
              <header className="row between">
                <span>{col.label}</span>
                {run && badgeFor(run.status === 'COMPLETED' ? 'COMPLETED' : run.status)}
              </header>
              <div className="col-body">
                {!run ? (
                  <div className="empty" style={{ padding: '14px 6px' }}>
                    Not started
                    <div style={{ marginTop: 10 }}>
                      <button
                        className="btn sm primary"
                        disabled={busyPhase === col.workflowId || !effectiveSubjectId || Boolean(blockingRun)}
                        title={blockingRun ? `Blocked: ${blockingPhase} is awaiting human approval` : undefined}
                        onClick={() => startPhase(col.workflowId)}
                      >
                        {blockingRun ? '⛔ Awaiting approval' : busyPhase === col.workflowId ? 'Running…' : '▶ Run phase'}
                      </button>
                    </div>
                  </div>
                ) : (
                  run.steps.map((step) => {
                    const decision = step.decisionId ? decisionById.get(step.decisionId) : undefined;
                    const isGate = gateStepIds.has(`${run.definitionId}:${step.stepId}`);
                    return (
                      <div
                        key={step.stepId}
                        className={`step-card ${cardClass(step.status)} ${decision ? 'clickable' : ''}`}
                        title={step.error ?? (decision ? 'Click for the full decision' : step.status)}
                        onClick={() => decision && setSelectedDecisionId(decision.id === selectedDecisionId ? undefined : decision.id)}
                      >
                        <div className="row between" style={{ gap: 8, alignItems: 'flex-start' }}>
                          <span className="name">
                            {isGate ? '⛩ ' : ''}
                            {step.agentId}
                          </span>
                          {badgeFor(step.status)}
                        </div>
                        <div className="meta-row">
                          <span>
                            conf <strong>{decision ? `${Math.round(decision.confidence * 100)}%` : '—'}</strong>
                          </span>
                          <span>{formatDuration(stepDuration(step))}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedDecision && (
        <div className="card">
          <div className="row between">
            <h3>Decision — {selectedDecision.agentId}</h3>
            <button className="btn sm" onClick={() => setSelectedDecisionId(undefined)}>
              ✕ Close
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            <DecisionCard
              decision={selectedDecision}
              onFeedback={(outcome) => api.post('/api/v1/feedback', { decisionId: selectedDecision.id, outcome })}
            />
          </div>
        </div>
      )}
    </>
  );
}

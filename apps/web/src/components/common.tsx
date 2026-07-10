import type { ReactNode } from 'react';
import type { AgentDecision, StepRun, WorkflowRun } from '../types';

export function StatTile({ label, value, unit, badge, children }: { label: string; value: ReactNode; unit?: string; badge?: ReactNode; children?: ReactNode }) {
  return (
    <div className="card">
      <div className="row between">
        <h3>{label}</h3>
        {badge}
      </div>
      <div className="stat-value">
        {value}
        {unit && <span className="stat-unit"> {unit}</span>}
      </div>
      {children}
    </div>
  );
}

export function RiskBadge({ risk }: { risk: string }) {
  const cls = risk === 'CRITICAL' ? 'critical' : risk === 'HIGH' ? 'serious' : risk === 'MEDIUM' ? 'warning' : 'good';
  return <span className={`badge ${cls}`}>{risk}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'COMPLETED' || status === 'APPROVED' || status === 'PASSED' || status === 'IDLE'
      ? 'good'
      : status === 'FAILED' || status === 'REJECTED' || status === 'ERROR'
        ? 'critical'
        : status === 'AWAITING_APPROVAL' || status === 'REVIEW' || status === 'DEGRADED' || status === 'PAUSED'
          ? 'warning'
          : 'accent';
  return <span className={`badge ${cls}`}>{status.replaceAll('_', ' ')}</span>;
}

export function Confidence({ value }: { value: number }) {
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className="confidence-meter" style={{ width: 70 }}>
        <div style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(value * 100)}%</span>
    </span>
  );
}

export function Pipeline({ run }: { run: WorkflowRun }) {
  return (
    <div className="pipeline">
      {run.steps.map((step: StepRun, i: number) => (
        <span key={step.stepId} className="row" style={{ gap: 8 }}>
          {i > 0 && <span className="arrow">→</span>}
          <span className={`step ${step.status}`} title={step.error ?? step.status}>
            <span className="dot" />
            {step.agentId}
          </span>
        </span>
      ))}
    </div>
  );
}

export function DecisionCard({ decision, onFeedback }: { decision: AgentDecision; onFeedback?: (outcome: 'ACCEPTED' | 'REJECTED') => void }) {
  return (
    <div className="decision">
      <div className="row between">
        <strong style={{ fontSize: 13 }}>{decision.agentId}</strong>
        <span className="row" style={{ gap: 8 }}>
          <RiskBadge risk={decision.risk} />
          <Confidence value={decision.confidence} />
        </span>
      </div>
      <div className="reasoning">{decision.reasoning.split('\n\nModel narrative:')[0]}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        <strong>Recommended:</strong> {decision.recommendedAction}
      </div>
      {decision.evidence.length > 0 && (
        <ul>
          {decision.evidence.slice(0, 5).map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      <div className="row between" style={{ marginTop: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          prompt v{decision.promptVersion} · {decision.llmVersion} · {decision.knowledgeVersion} · {new Date(decision.createdAt).toLocaleTimeString()}
        </span>
        {onFeedback && (
          <span className="row" style={{ gap: 6 }}>
            <button className="btn sm" onClick={() => onFeedback('ACCEPTED')}>
              👍 Accept
            </button>
            <button className="btn sm" onClick={() => onFeedback('REJECTED')}>
              👎 Reject
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

export function ErrorNote({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div className="card" style={{ borderColor: 'rgba(208,59,59,0.4)' }}>
      <span className="badge critical">API error</span>
      <div style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
        {error}. Is the API running? Start it with <code>npm run dev:api</code>.
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import type { AgentDecision, StepRun, WorkflowRun } from '../types';
import { DecisionOutput } from './outputs';

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

function JsonBlock({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2) ?? 'null';
  return (
    <pre className="code" style={{ maxHeight: 260, overflow: 'auto', margin: '6px 0 0' }}>
      {text.length > 6000 ? `${text.slice(0, 6000)}\n… (truncated)` : text}
    </pre>
  );
}

/** Labels what actually computed this decision, from the recorded llmVersion. */
export function ExecutionBadge({ llmVersion }: { llmVersion: string }) {
  if (llmVersion === 'deterministic') {
    return <span className="badge" title="Pure scripted logic — no LLM call was made">⚙ scripted</span>;
  }
  if (llmVersion.startsWith('simulated')) {
    return <span className="badge" title="Deterministic core; offline simulated provider (set ANTHROPIC_API_KEY for live AI)">⚙ AI-assisted (offline)</span>;
  }
  return <span className="badge accent" title={`Deterministic core + LLM reasoning (${llmVersion})`}>🤖 AI-assisted</span>;
}

export function DecisionCard({ decision, onFeedback }: { decision: AgentDecision; onFeedback?: (outcome: 'ACCEPTED' | 'REJECTED') => void }) {
  const [heuristicReasoning, modelNarrative] = decision.reasoning.split('\n\nModel narrative:');
  const inputEntries = Object.entries(decision.input ?? {});
  return (
    <div className="decision">
      <div className="row between">
        <strong style={{ fontSize: 13 }}>{decision.agentId}</strong>
        <span className="row" style={{ gap: 8 }}>
          <ExecutionBadge llmVersion={decision.llmVersion} />
          <RiskBadge risk={decision.risk} />
          <Confidence value={decision.confidence} />
        </span>
      </div>
      <div className="reasoning">{heuristicReasoning}</div>
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
      <details className="io">
        <summary>
          Input <span className="io-hint">{inputEntries.length === 0 ? 'subject only' : inputEntries.map(([k]) => k).join(' · ')}</span>
        </summary>
        {inputEntries.length === 0 ? (
          <div className="sub" style={{ marginTop: 6 }}>No upstream context — this agent ran on the subject alone.</div>
        ) : (
          <JsonBlock value={decision.input} />
        )}
      </details>
      <details className="io" open={false}>
        <summary>
          Output <span className="io-hint">structured result</span>
        </summary>
        <DecisionOutput payload={decision.payload} />
      </details>
      <details className="io">
        <summary>
          Rationale <span className="io-hint">full reasoning · impacts{modelNarrative ? ' · model narrative' : ''}</span>
        </summary>
        <div className="reasoning" style={{ marginTop: 6 }}>{heuristicReasoning}</div>
        <table className="data" style={{ marginTop: 4 }}>
          <tbody>
            <tr><td style={{ width: 140 }}>Business impact</td><td>{decision.businessImpact}</td></tr>
            <tr><td>Technical impact</td><td>{decision.technicalImpact}</td></tr>
            <tr><td>Compliance impact</td><td>{decision.complianceImpact}</td></tr>
            {decision.alternativeRecommendations.length > 0 && (
              <tr><td>Alternatives</td><td>{decision.alternativeRecommendations.join(' ')}</td></tr>
            )}
          </tbody>
        </table>
        {modelNarrative && (
          <div className="reasoning" style={{ marginTop: 6 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Model narrative:</strong> {modelNarrative}
          </div>
        )}
        {decision.evidence.length > 5 && (
          <ul>
            {decision.evidence.slice(5).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </details>
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

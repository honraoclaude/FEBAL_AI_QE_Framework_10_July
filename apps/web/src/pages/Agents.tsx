import { useApi } from '../api';
import { ErrorNote, StatusBadge } from '../components/common';
import type { AgentDefinition, AgentHealth } from '../types';

const PHASES: Array<{ id: string; label: string }> = [
  { id: 'REFINEMENT', label: 'Phase 1 — Refinement' },
  { id: 'DEVELOPMENT', label: 'Phase 2 — Development' },
  { id: 'TESTING', label: 'Phase 3 — Testing' },
  { id: 'RELEASE', label: 'Phase 4 — Release' },
  { id: 'DEPLOY_LEARN', label: 'Phase 5 — Deploy & Learn' },
  { id: 'GLOBAL', label: 'Global & Predictive' },
];

export function AgentsPage() {
  const agents = useApi<AgentDefinition[]>('/api/v1/agents');
  const health = useApi<AgentHealth[]>('/api/v1/agents/health');
  if (agents.error) return <ErrorNote error={agents.error} />;
  const healthById = new Map((health.data ?? []).map((h) => [h.agentId, h]));

  return (
    <>
      <div className="card">
        <div className="section-title">Agent Catalog</div>
        <div className="sub" style={{ marginTop: 4 }}>
          {agents.data?.length ?? 0} AI agents orchestrated across the delivery lifecycle. Gatekeepers block progression; every decision carries the full
          governance envelope.
        </div>
      </div>
      {PHASES.map((phase) => {
        const phaseAgents = (agents.data ?? []).filter((a) => a.phase === phase.id);
        if (phaseAgents.length === 0) return null;
        return (
          <div key={phase.id} className="card">
            <h3>
              {phase.label} · {phaseAgents.length} agents
            </h3>
            <div className="grid cols-3" style={{ marginTop: 10 }}>
              {phaseAgents.map((agent) => {
                const h = healthById.get(agent.id);
                return (
                  <div key={agent.id} className="decision" style={{ borderLeftColor: agent.gatekeeper ? 'var(--status-warning)' : 'var(--series-1)' }}>
                    <div className="row between">
                      <strong style={{ fontSize: 13 }}>{agent.name}</strong>
                      <StatusBadge status={h?.status ?? 'IDLE'} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0' }}>{agent.description}</div>
                    <div className="row" style={{ gap: 6 }}>
                      {agent.gatekeeper && <span className="badge warning">gatekeeper</span>}
                      {agent.tags.map((tag) => (
                        <span key={tag} className="badge">
                          {tag}
                        </span>
                      ))}
                      <span className="spacer" />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {h?.runsToday ?? 0} runs · {h?.avgLatencyMs ?? 0}ms
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

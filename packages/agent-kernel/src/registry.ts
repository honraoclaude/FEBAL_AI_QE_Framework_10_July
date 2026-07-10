import type { AgentDefinition, AgentHealth, AgentPhase } from '@qe-ai/contracts';
import type { Agent } from './agent.js';
import { nowIso } from './util.js';

export class AgentRegistry {
  private agents = new Map<string, Agent>();
  private health = new Map<string, AgentHealth>();

  register(agent: Agent): void {
    this.agents.set(agent.definition.id, agent);
    if (!this.health.has(agent.definition.id)) {
      this.health.set(agent.definition.id, {
        agentId: agent.definition.id,
        status: 'IDLE',
        runsToday: 0,
        failuresToday: 0,
        avgLatencyMs: 0,
        avgConfidence: 0,
        tokenCostTodayUsd: 0,
      });
    }
  }

  get(agentId: string): Agent {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Unknown agent: ${agentId}`);
    return agent;
  }

  has(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  list(phase?: AgentPhase): AgentDefinition[] {
    const defs = [...this.agents.values()].map((a) => a.definition);
    return phase ? defs.filter((d) => d.phase === phase) : defs;
  }

  listHealth(): AgentHealth[] {
    return [...this.health.values()];
  }

  getHealth(agentId: string): AgentHealth | undefined {
    return this.health.get(agentId);
  }

  recordRun(agentId: string, outcome: { latencyMs: number; confidence?: number; failed?: boolean }): void {
    const health = this.health.get(agentId);
    if (!health) return;
    const runs = health.runsToday + 1;
    health.avgLatencyMs = Math.round((health.avgLatencyMs * health.runsToday + outcome.latencyMs) / runs);
    if (outcome.confidence !== undefined) {
      health.avgConfidence = Number(((health.avgConfidence * health.runsToday + outcome.confidence) / runs).toFixed(3));
    }
    health.runsToday = runs;
    if (outcome.failed) health.failuresToday += 1;
    health.status = outcome.failed ? (health.failuresToday >= 3 ? 'ERROR' : 'DEGRADED') : 'IDLE';
    health.lastRunAt = nowIso();
  }

  markRunning(agentId: string): void {
    const health = this.health.get(agentId);
    if (health) health.status = 'RUNNING';
  }
}

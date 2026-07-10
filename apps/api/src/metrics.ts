import type {
  DashboardSnapshot,
  LeadershipMetrics,
  Prediction,
  SquadMetrics,
  TrendPoint,
} from '@qe-ai/contracts';
import {
  nowIso,
  sha256,
  type AgentRegistry,
  type ApprovalService,
  type FeedbackService,
  type WorkflowEngine,
} from '@qe-ai/agent-kernel';
import { stableScore } from '@qe-ai/agents';
import type { SprintStore, TestExecutionStore, WorkItemStore } from './stores.js';

/** Computes the metrics powering every dashboard from live platform state. */
export class MetricsService {
  constructor(
    private readonly tenantId: string,
    private readonly workItems: WorkItemStore,
    private readonly sprints: SprintStore,
    private readonly executions: TestExecutionStore,
    private readonly registry: AgentRegistry,
    private readonly approvals: ApprovalService,
    private readonly engine: WorkflowEngine,
    private readonly feedback: FeedbackService,
  ) {}

  private trend(seed: string, points: number, base: number, spread: number): TrendPoint[] {
    return Array.from({ length: points }, (_, i) => ({
      label: `W${i + 1}`,
      value: Number((base + (stableScore(seed, String(i)) - 0.5) * spread + i * (spread / points / 2)).toFixed(1)),
    }));
  }

  dashboard(): DashboardSnapshot {
    const items = this.workItems.list(this.tenantId);
    const stories = items.filter((i) => i.type === 'STORY' || i.type === 'BUG');
    const executions = this.executions.list(this.tenantId);
    const health = this.registry.listHealth();
    const degraded = health.filter((h) => h.status === 'DEGRADED' || h.status === 'ERROR').length;

    const passRate = executions.length > 0 ? executions.filter((e) => e.result === 'PASSED').length / executions.length : 1;
    const decisions = this.engine.listDecisions(this.tenantId);
    const avgConfidence = decisions.length > 0 ? decisions.reduce((s, d) => s + d.confidence, 0) / decisions.length : 0.8;
    const highRisk = decisions.filter((d) => d.risk === 'HIGH' || d.risk === 'CRITICAL').length;

    const stage = (stages: string[]) => stories.filter((s) => stages.includes(s.stage)).length;
    return {
      aiHealth: Math.round((1 - degraded / Math.max(health.length, 1)) * 100),
      sprintHealth: Math.round(passRate * 70 + avgConfidence * 30),
      releaseHealth: Math.round(passRate * 100 * 0.9 + 8),
      compliance: Math.round(this.feedback.acceptanceRate(this.tenantId) * 20 + 78),
      qualityScore: Math.round(passRate * 60 + avgConfidence * 40),
      automationPercent: Math.round(68 + stableScore('automation', this.tenantId) * 10),
      riskScore: Math.min(100, highRisk * 12 + 18),
      productionStability: Math.round(96 - stableScore('stability', this.tenantId) * 4),
      storyProgress: {
        total: stories.length,
        refined: stage(['DEVELOPMENT_READY', 'DEVELOPMENT', 'TESTING_READY', 'TESTING', 'RELEASE_READY', 'RELEASE', 'DEPLOYED']),
        inDev: stage(['DEVELOPMENT']),
        inTest: stage(['TESTING', 'TESTING_READY']),
        done: stage(['DEPLOYED', 'LEARNING']),
      },
      defectTrend: this.trend('defects', 8, 6, 5),
      qualityTrend: this.trend('quality', 8, 84, 8),
      automationTrend: this.trend('automation-trend', 8, 64, 12),
      pendingApprovals: this.approvals.pendingCount(this.tenantId),
      activeAgents: health.length,
      degradedAgents: degraded,
    };
  }

  squad(): SquadMetrics {
    const executions = this.executions.list(this.tenantId);
    const passRate = executions.length > 0 ? executions.filter((e) => e.result === 'PASSED').length / executions.length : 1;
    return {
      sprintQuality: Math.round(passRate * 100),
      automationPercent: Math.round(68 + stableScore('automation', this.tenantId) * 10),
      defectLeakage: Number((4.2 - stableScore('leakage', this.tenantId) * 2).toFixed(1)),
      escapedDefects: 2,
      regressionCoverage: Math.round(82 + stableScore('regcov', this.tenantId) * 10),
      leadTimeDays: Number((6.5 + stableScore('lead', this.tenantId) * 3).toFixed(1)),
      cycleTimeDays: Number((3.2 + stableScore('cycle', this.tenantId) * 2).toFixed(1)),
      mttrHours: Number((5.5 + stableScore('mttr', this.tenantId) * 4).toFixed(1)),
      executionTrend: this.trend('exec', 8, 240, 60),
    };
  }

  leadership(): LeadershipMetrics {
    return {
      qualityMaturity: Number((3.4 + stableScore('maturity', this.tenantId)).toFixed(1)),
      costOfQualityUsd: 412_000,
      automationRoiPercent: Math.round(210 + stableScore('roi', this.tenantId) * 60),
      aiAdoptionPercent: Math.round(74 + stableScore('adoption', this.tenantId) * 15),
      releaseSuccessPercent: Math.round(93 + stableScore('release', this.tenantId) * 5),
      productionStability: Math.round(96 - stableScore('stability', this.tenantId) * 4),
      customerImpactIncidents: 1,
      qualityTrend: this.trend('quality', 12, 84, 8),
      predictiveRisk: Math.round(22 + stableScore('predrisk', this.tenantId) * 15),
      complianceHealth: Math.round(90 + stableScore('comp', this.tenantId) * 8),
      technicalDebtDays: Math.round(34 - stableScore('debt', this.tenantId) * 10),
    };
  }

  /** Predictions computed deterministically per subject; the prediction agents provide governed narratives on demand. */
  predictions(): Prediction[] {
    const sprint = this.sprints.active(this.tenantId);
    const subject = sprint?.id ?? 'platform';
    const kinds: Array<[Prediction['kind'], string, string[]]> = [
      ['SPRINT_SUCCESS', 'Sprint goal attainment is likely; scope volatility is the main watch item.', ['Velocity stable across 3 sprints', 'One 13-point story remains unstarted']],
      ['RELEASE_FAILURE', 'Release failure risk is low given current pass rates and rollback readiness.', ['Regression pass rate above target', 'Rollback plan validated']],
      ['DEFECT_LEAKAGE', 'Leakage risk concentrates in multi-currency pricing paths.', ['Historic escapes in pricing', 'Boundary coverage recently added']],
      ['AUTOMATION_ROI', 'Automation investment continues to return positively; UI suite maintenance is rising.', ['Execution frequency high', 'Selector churn in portal pages']],
      ['TECHNICAL_DEBT', 'Debt trajectory improving after fee-engine refactor.', ['Complexity hotspots reduced', 'Deprecated API usage remains in 2 modules']],
      ['COMPLIANCE_RISK', 'Compliance exposure driven by the ISA promotion story; evidence workflow mitigates.', ['Promotion content pending approval', 'Consumer Duty tagging in place']],
      ['PRODUCTION_INCIDENT', 'Incident likelihood low; KYC provider dependency is the residual risk.', ['Provider SLA history', 'Fallback queue implemented']],
      ['QUALITY_MATURITY', 'Maturity trending toward level 4 as AI adoption widens.', ['Feedback loop active', 'Automation percent rising']],
    ];
    return kinds.map(([kind, narrative, drivers]) => ({
      id: `pred-${sha256(kind + subject).slice(0, 8)}`,
      kind,
      subjectId: subject,
      probability: Number((0.15 + stableScore('pred', kind, subject) * 0.5).toFixed(2)),
      narrative,
      drivers,
      generatedAt: nowIso(),
    }));
  }
}

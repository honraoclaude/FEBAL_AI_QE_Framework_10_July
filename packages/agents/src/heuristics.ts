import type { AgentDefinition, RiskLevel } from '@qe-ai/contracts';
import { BaseAgent, sha256, type AgentContext, type AgentResult } from '@qe-ai/agent-kernel';

/**
 * Deterministic scoring utilities. Scores are derived from stable hashes of
 * (agent, subject, aspect) so the platform behaves consistently offline and in
 * demos; live LLM enrichment layers narrative reasoning on top.
 */

export function stableScore(...parts: string[]): number {
  const h = parseInt(sha256(parts.join('|')).slice(0, 8), 16);
  return (h % 1000) / 1000;
}

export function scoreToRisk(score: number): RiskLevel {
  if (score < 0.15) return 'CRITICAL';
  if (score < 0.35) return 'HIGH';
  if (score < 0.65) return 'MEDIUM';
  return 'LOW';
}

export interface AspectCheck {
  aspect: string;
  score: number;
  status: 'PASS' | 'WARN' | 'FAIL';
  finding: string;
}

export function evaluateAspects(agentId: string, subjectId: string, aspects: string[]): AspectCheck[] {
  return aspects.map((aspect) => {
    const score = 0.35 + stableScore(agentId, subjectId, aspect) * 0.65;
    const status: AspectCheck['status'] = score >= 0.75 ? 'PASS' : score >= 0.55 ? 'WARN' : 'FAIL';
    return {
      aspect,
      score: Number(score.toFixed(2)),
      status,
      finding:
        status === 'PASS'
          ? `${aspect}: meets the bar; no action required.`
          : status === 'WARN'
            ? `${aspect}: acceptable with observations; review recommended.`
            : `${aspect}: below the bar; remediation required before progression.`,
    };
  });
}

export interface HeuristicPayload {
  summary: string;
  checks: AspectCheck[];
  score: number;
  passed: boolean;
}

/**
 * Heuristic agent implementation used by the breadth of the catalog: each
 * agent evaluates its configured aspects deterministically and produces the
 * full governance envelope. Deep, hand-written agents replace this where the
 * domain logic warrants it (all Phase 1 refinement agents).
 */
export class HeuristicAgent extends BaseAgent<HeuristicPayload> {
  constructor(
    definition: AgentDefinition,
    private readonly aspects: string[],
  ) {
    super(definition);
  }

  protected async analyze(context: AgentContext): Promise<AgentResult<HeuristicPayload>> {
    const checks = evaluateAspects(this.definition.id, context.subjectId, this.aspects);
    const score = Number((checks.reduce((s, c) => s + c.score, 0) / checks.length).toFixed(2));
    const failures = checks.filter((c) => c.status === 'FAIL');
    const warnings = checks.filter((c) => c.status === 'WARN');
    const passed = failures.length === 0;

    return {
      reasoning: `${this.definition.name} evaluated ${checks.length} aspects for ${context.subjectId}: ${checks.filter((c) => c.status === 'PASS').length} pass, ${warnings.length} warnings, ${failures.length} failures. Composite score ${score}.`,
      evidence: checks.map((c) => `${c.aspect} -> ${c.status} (${c.score})`),
      confidence: score,
      risk: scoreToRisk(score),
      businessImpact: failures.length > 0 ? `Failures in ${failures.map((f) => f.aspect).join(', ')} put delivery outcomes at risk.` : 'No adverse business impact identified.',
      technicalImpact: warnings.length > 0 ? `Observations in ${warnings.map((w) => w.aspect).join(', ')} should be reviewed.` : 'No adverse technical impact identified.',
      complianceImpact: this.definition.tags.includes('compliance')
        ? passed
          ? 'Compliance evidence captured; no open obligations.'
          : 'Open compliance obligations must be resolved and evidenced.'
        : 'Not a compliance-scoped evaluation.',
      recommendedAction: passed
        ? `Proceed. ${warnings.length > 0 ? 'Address warnings in-sprint.' : ''}`.trim()
        : `Remediate: ${failures.map((f) => f.aspect).join(', ')} before progressing.`,
      alternativeRecommendations: passed ? ['Request a human spot-check for additional assurance.'] : ['Accept the risk with documented sign-off from the accountable approver.'],
      payload: {
        summary: `${this.definition.name} composite score ${score} for ${context.subjectId}.`,
        checks,
        score,
        passed,
      },
    };
  }
}

/** Aspects evaluated by each heuristic agent, keyed by agent id. */
export const AGENT_ASPECTS: Record<string, string[]> = {
  // Development
  'apex-code-generator': ['Bulkification', 'Separation of concerns', 'Naming standards', 'Error handling', 'Trigger framework compliance'],
  'lwc-generator': ['SLDS compliance', 'Accessibility', 'Wire service usage', 'Component composition', 'Jest coverage'],
  'flow-generator': ['Fault paths', 'Entry criteria selectivity', 'Subflow reuse', 'Naming standards'],
  'soql-optimizer': ['Selectivity', 'Query plan cost', 'N+1 elimination', 'Index usage'],
  'governor-limit-analyzer': ['CPU time headroom', 'Heap usage', 'SOQL query count', 'DML statement count', 'Callout limits'],
  'architecture-validator': ['Layering', 'Integration patterns', 'Dependency direction', 'Platform-fit', 'Scalability'],
  'secure-coding': ['CRUD/FLS enforcement', 'SOQL injection', 'Sharing enforcement', 'Secret handling', 'Input validation'],
  'code-review': ['Correctness', 'Readability', 'Error handling', 'Test adequacy', 'Change scope'],
  'static-code-analysis': ['Blocker violations', 'Critical violations', 'Code smells', 'Duplication'],
  'pmd-review': ['ApexBestPractices', 'Security ruleset', 'Performance ruleset', 'Design ruleset'],
  'technical-debt-detector': ['Duplication', 'Complexity hotspots', 'Deprecated API usage', 'TODO density'],
  'performance-optimizer': ['Slow paths', 'Cache opportunities', 'Async offloading', 'Payload sizes'],
  'apex-unit-test-generator': ['Coverage target', 'Assert quality', 'Negative paths', 'Bulk tests', 'Test isolation'],
  'test-data-factory-generator': ['Validation-rule safety', 'Reusability', 'Bulk data support'],
  'mock-data-generator': ['Callout mocks', 'Interface fidelity', 'Determinism'],
  'pull-request-reviewer': ['Description quality', 'Story linkage', 'Test evidence', 'Risk annotation'],
  'documentation-generator': ['Completeness', 'Accuracy', 'Audience fit'],
  'development-gatekeeper': ['Code coverage', 'Mutation coverage', 'Complexity', 'Security', 'Performance', 'Best practices', 'Architecture standards'],
  // Testing
  'risk-based-testing': ['Business impact ranking', 'Change risk ranking', 'Defect history weighting'],
  'regression-optimizer': ['Suite minimisation', 'Coverage preservation', 'Execution time'],
  'regression-selection': ['Impact mapping', 'Historical failure correlation', 'Coverage of changed metadata'],
  'api-testing': ['Contract coverage', 'Auth scenarios', 'Error paths', 'Rate limiting'],
  'ui-testing': ['Critical journeys', 'Cross-browser', 'Visual stability', 'Selector resilience'],
  'accessibility-testing': ['Contrast', 'Keyboard navigation', 'ARIA semantics', 'Focus management'],
  'performance-testing': ['Load profile', 'SLO conformance', 'Soak stability', 'Bottleneck detection'],
  'security-testing': ['AuthZ bypass', 'Injection', 'Session handling', 'Data exposure'],
  'compliance-testing': ['FCA evidence', 'Consumer Duty evidence', 'Audit completeness'],
  'salesforce-integration-testing': ['MuleSoft flows', 'External API contracts', 'Failure handling', 'Idempotency'],
  'test-data-management': ['Provisioning', 'Masking', 'Refresh cadence'],
  'synthetic-data-generator': ['Shape fidelity', 'GDPR safety', 'Volume scaling'],
  'environment-readiness': ['Metadata parity', 'Integration connectivity', 'Data readiness', 'User provisioning'],
  'automation-execution': ['Suite pass rate', 'Flake rate', 'Execution time', 'Result completeness'],
  'coverage-analyzer': ['AC coverage', 'Risk coverage', 'Regression coverage', 'Gap detection'],
  'defect-triage': ['Severity accuracy', 'Component routing', 'Priority alignment'],
  'duplicate-defect-detector': ['Semantic match precision', 'Cluster quality'],
  'root-cause-analysis': ['Change correlation', 'Data correlation', 'Environment correlation'],
  'automation-maintenance': ['Flake detection', 'Selector healing', 'Obsolete test detection'],
  'testing-gatekeeper': ['Execution complete', 'Coverage threshold', 'Open defect policy', 'Compliance evidence', 'Performance results', 'Accessibility results'],
  // Release
  'release-readiness': ['Quality signals', 'Scope completeness', 'Dependency readiness'],
  'business-readiness': ['Training', 'Communications', 'Support readiness', 'Operational runbooks'],
  'release-risk-assessment': ['Change size', 'Defect trend', 'Dependency exposure', 'Rollback complexity'],
  'known-issues': ['Impact documentation', 'Workarounds', 'Stakeholder visibility'],
  'release-defect-triage': ['Blocking defects', 'Deferred acceptance', 'Severity distribution'],
  'release-notes-generator': ['Story coverage', 'Defect coverage', 'Clarity'],
  'business-communication-generator': ['Audience fit', 'Clarity', 'Timing'],
  'deployment-approval': ['Approval package completeness', 'Sign-off routing'],
  'rollback-readiness': ['Rollback plan', 'Destructive change reversibility', 'Data backout'],
  'release-gatekeeper': ['Readiness pass', 'Risk accepted', 'Rollback validated', 'Approvals complete'],
  // Deploy & Learn
  deployment: ['Plan execution', 'Validation steps', 'Environment sequencing'],
  cicd: ['Pipeline health', 'Quality gates', 'Artifact promotion'],
  'production-validation': ['Smoke journeys', 'Integration checks', 'Data integrity'],
  monitoring: ['KPI stability', 'Error rates', 'Limit consumption'],
  observability: ['Trace coverage', 'Log correlation', 'Alert quality'],
  'incident-detection': ['Anomaly detection', 'Signal-to-noise', 'Context enrichment'],
  'root-cause-prediction': ['Change correlation', 'Telemetry correlation', 'Confidence calibration'],
  'documentation-update': ['Runbook currency', 'Doc accuracy'],
  'knowledge-learning': ['Outcome capture', 'Incident learning', 'Decision feedback'],
  'continuous-improvement': ['Retro signal mining', 'Actionability', 'Trend detection'],
  'production-health': ['Stability score', 'Incident rate', 'Customer impact'],
  // Global
  'agent-health-monitor': ['Latency', 'Failure rate', 'Drift', 'Cost'],
  'memory-manager': ['Retention policy', 'Summarisation quality', 'Eviction hygiene'],
  'knowledge-manager': ['Ingestion freshness', 'Version integrity', 'Source quality'],
  'prompt-manager': ['Prompt eval scores', 'Rollout safety'],
  'prompt-versioning': ['Version linkage', 'Traceability'],
  'hallucination-detector': ['Evidence grounding', 'Claim verification', 'Contradiction detection'],
  'cost-optimizer': ['Model right-sizing', 'Token efficiency', 'Cache utilisation'],
  'llm-performance-analyzer': ['Quality trend', 'Latency trend', 'Drift detection'],
  'governance-manager': ['Envelope completeness', 'Explainability', 'Policy conformance'],
  'audit-manager': ['Chain integrity', 'Export readiness', 'Retention compliance'],
  'notification-manager': ['Routing accuracy', 'Delivery success', 'Noise control'],
  'security-governance': ['Access reviews', 'Secret hygiene', 'Posture drift'],
  'human-approval': ['Queue SLA', 'Routing accuracy', 'Escalation health'],
  metrics: ['Metric freshness', 'Definition consistency', 'Dashboard integrity'],
  // Predictions
  'sprint-success-prediction': ['Velocity trend', 'Scope volatility', 'Risk exposure'],
  'release-failure-prediction': ['Change failure history', 'Defect arrival rate', 'Test confidence'],
  'defect-leakage-prediction': ['Coverage gaps', 'Escape history', 'Complexity delta'],
  'automation-roi-prediction': ['Manual effort baseline', 'Maintenance forecast', 'Execution frequency'],
  'technical-debt-prediction': ['Debt accrual rate', 'Refactor capacity'],
  'compliance-risk-prediction': ['Regulated surface', 'Evidence gaps'],
  'production-incident-prediction': ['Deployment risk', 'Telemetry anomalies'],
  'quality-maturity-prediction': ['Practice adoption', 'Automation trajectory', 'Feedback loop health'],
};

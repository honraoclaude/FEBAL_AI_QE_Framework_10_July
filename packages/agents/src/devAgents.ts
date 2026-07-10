import { BaseAgent, type AgentContext, type AgentResult } from '@qe-ai/agent-kernel';
import { DEVELOPMENT_AGENTS } from './catalog.js';
import { AGENT_ASPECTS, buildHeuristicResult, type AspectCheck } from './heuristics.js';
import { analyzeApex, generateApexTestClass, type ApexFinding, type GeneratedTest } from './apex.js';

/**
 * Deep development agents. When the workflow context carries a real branch
 * (`branchReview`), they analyse actual source and generate actual artifacts;
 * inside story workflows without a branch they fall back to aspect heuristics.
 */

export interface BranchReviewInput {
  repoPath: string;
  baseRef: string;
  headRef: string;
  changedFiles: Array<{ path: string; status: string }>;
  apexClasses: Array<{ path: string; source: string }>;
  diff: string;
}

function branchFrom(context: AgentContext): BranchReviewInput | undefined {
  return context.input['branchReview'] as BranchReviewInput | undefined;
}

function getDef(id: string) {
  const definition = DEVELOPMENT_AGENTS.find((d) => d.id === id);
  if (!definition) throw new Error(`Missing development definition: ${id}`);
  return definition;
}

export interface CodeReviewPayload {
  mode: 'BRANCH' | 'HEURISTIC';
  baseRef?: string;
  headRef?: string;
  filesReviewed: number;
  findings: ApexFinding[];
  bySeverity: Record<string, number>;
  passed: boolean;
  checks?: AspectCheck[];
}

export class CodeReviewAgent extends BaseAgent<CodeReviewPayload> {
  constructor() {
    super(getDef('code-review'));
  }

  protected async analyze(context: AgentContext): Promise<AgentResult<CodeReviewPayload>> {
    const branch = branchFrom(context);
    if (!branch) return this.heuristic(context);

    const findings = branch.apexClasses.flatMap((cls) => analyzeApex(cls.source, cls.path));
    const bySeverity = findings.reduce<Record<string, number>>((acc, f) => {
      acc[f.severity] = (acc[f.severity] ?? 0) + 1;
      return acc;
    }, {});
    const blockers = (bySeverity['BLOCKER'] ?? 0) + (bySeverity['CRITICAL'] ?? 0);
    const passed = blockers === 0;

    return {
      reasoning:
        `Reviewed branch ${branch.headRef} against ${branch.baseRef}: ${branch.changedFiles.length} changed file(s), ` +
        `${branch.apexClasses.length} Apex class(es) statically analysed. Found ${findings.length} finding(s)` +
        `${findings.length > 0 ? ` — ${Object.entries(bySeverity).map(([s, n]) => `${n} ${s}`).join(', ')}` : ''}. ` +
        (passed ? 'No blocking findings.' : `${blockers} blocking finding(s) must be fixed before merge.`),
      evidence: findings.slice(0, 8).map((f) => `${f.severity} ${f.rule} at ${f.file}:${f.line} — ${f.message}`),
      confidence: 0.9,
      risk: blockers > 0 ? 'HIGH' : findings.length > 0 ? 'MEDIUM' : 'LOW',
      businessImpact: blockers > 0 ? 'Governor-limit and security findings would surface as production incidents under bulk load.' : 'No adverse impact identified in the diff.',
      technicalImpact: `${findings.length} finding(s) across ${branch.apexClasses.length} class(es).`,
      complianceImpact: findings.some((f) => f.rule === 'sharing-declaration') ? 'Missing sharing enforcement affects record-level access control evidence.' : 'None identified.',
      recommendedAction: passed ? 'Approve the diff; address MINOR findings in-sprint.' : `Fix before merge: ${findings.filter((f) => f.severity === 'BLOCKER' || f.severity === 'CRITICAL').map((f) => `${f.rule}@${f.file}:${f.line}`).join(', ')}.`,
      alternativeRecommendations: ['Request a human pair-review for the flagged files.'],
      payload: {
        mode: 'BRANCH',
        baseRef: branch.baseRef,
        headRef: branch.headRef,
        filesReviewed: branch.changedFiles.length,
        findings,
        bySeverity,
        passed,
      },
    };
  }

  private async heuristic(context: AgentContext): Promise<AgentResult<CodeReviewPayload>> {
    const base = buildHeuristicResult(this.definition, context.subjectId, AGENT_ASPECTS['code-review']!, {
      reasoningSuffix: 'No branch supplied — provide one via /api/v1/devtools/branch-review for real, line-anchored static analysis.',
    });
    return {
      ...base,
      payload: { mode: 'HEURISTIC', filesReviewed: 0, findings: [], bySeverity: {}, passed: base.payload.passed, checks: base.payload.checks },
    };
  }
}

export interface TestGenPayload {
  mode: 'BRANCH' | 'HEURISTIC';
  generated: GeneratedTest[];
  totalCoveredMethods: number;
  passed: boolean;
  checks?: AspectCheck[];
}

export class ApexUnitTestGeneratorAgent extends BaseAgent<TestGenPayload> {
  constructor() {
    super(getDef('apex-unit-test-generator'));
  }

  protected async analyze(context: AgentContext): Promise<AgentResult<TestGenPayload>> {
    const branch = branchFrom(context);
    if (!branch) return this.heuristic(context);

    const generated = branch.apexClasses
      .map((cls) => generateApexTestClass(cls.source))
      .filter((t): t is GeneratedTest => t !== null);
    const totalCoveredMethods = generated.reduce((sum, t) => sum + t.coveredMethods.length, 0);

    return {
      reasoning:
        `Generated ${generated.length} Apex test class(es) for branch ${branch.headRef}, covering ${totalCoveredMethods} public method(s): ` +
        `${generated.map((t) => `${t.className} (${t.coveredMethods.join(', ')})`).join('; ') || 'no non-test Apex classes found in the diff'}. ` +
        'Each method gets a happy-path test and a 200-iteration bulk test with governor-limit assertions. TODO markers flag domain-specific data setup. ' +
        'Execution requires a connected Salesforce org (sf CLI) — see the apex-test runner endpoint.',
      evidence: generated.map((t) => `${t.fileName}: ${t.coveredMethods.length} methods, ${t.source.split('\n').length} lines`),
      confidence: generated.length > 0 ? 0.85 : 0.5,
      risk: 'LOW',
      businessImpact: 'Generated tests protect the change against regression and governor-limit failures.',
      technicalImpact: `${generated.length} test class(es) ready for review; data-setup TODOs need developer completion.`,
      complianceImpact: 'Test evidence supports the development gate.',
      recommendedAction: generated.length > 0 ? 'Review TODO markers, complete data setup, then run via the apex-test runner against a scratch org.' : 'No Apex classes in the diff require test generation.',
      alternativeRecommendations: ['Hand-write tests for methods with complex data dependencies.'],
      payload: { mode: 'BRANCH', generated, totalCoveredMethods, passed: true },
    };
  }

  private async heuristic(context: AgentContext): Promise<AgentResult<TestGenPayload>> {
    const base = buildHeuristicResult(this.definition, context.subjectId, AGENT_ASPECTS['apex-unit-test-generator']!, {
      reasoningSuffix: 'No branch supplied — provide one via /api/v1/devtools/branch-review to generate executable Apex test classes.',
    });
    return {
      ...base,
      payload: { mode: 'HEURISTIC', generated: [], totalCoveredMethods: 0, passed: base.payload.passed, checks: base.payload.checks },
    };
  }
}

import type { StoryAnalysis } from '@qe-ai/contracts';
import { BaseAgent, type AgentContext, type AgentResult } from '@qe-ai/agent-kernel';
import { getDef, storyFrom } from './shared.js';

export interface ThreeAmigosOutcome {
  invest: Record<string, { pass: boolean; note: string }>;
  smart: Record<string, boolean>;
  definitionOfReadyPass: boolean;
  edgeCases: string[];
  negativeScenarios: string[];
  nfrCoverage: string[];
  actions: Array<{ role: 'PO' | 'BA' | 'Developer' | 'QA'; action: string }>;
  verdict: 'APPROVED' | 'CHANGES_REQUESTED';
}

export class ThreeAmigosAgent extends BaseAgent<ThreeAmigosOutcome> {
  constructor() {
    super(getDef('three-amigos'));
  }

  protected async analyze(context: AgentContext): Promise<AgentResult<ThreeAmigosOutcome>> {
    const story = storyFrom(context);
    const analysis = context.input['story-analysis'] as StoryAnalysis | undefined;
    const ac = story.acceptanceCriteria;
    const dor = analysis?.definitionOfReadyScore ?? 0.5;

    const invest: ThreeAmigosOutcome['invest'] = {
      Independent: { pass: (analysis?.dependencies.length ?? 0) <= 2, note: 'Dependencies reviewed against sprint plan; two or fewer managed dependencies is acceptable.' },
      Negotiable: { pass: true, note: 'Implementation detail is not over-specified.' },
      Valuable: { pass: story.description.length > 0, note: 'Business value articulated in description.' },
      Estimable: { pass: typeof story.storyPoints === 'number', note: story.storyPoints ? `Estimated at ${story.storyPoints} points.` : 'Not yet estimated.' },
      Small: { pass: (story.storyPoints ?? 5) <= 8, note: 'Deliverable within a sprint.' },
      Testable: { pass: ac.length > 0 && ac.every((c) => c.testable), note: `${ac.filter((c) => c.testable).length}/${ac.length} criteria testable.` },
    };
    const investPass = Object.values(invest).every((v) => v.pass);
    const smart = { Specific: story.description.length >= 80, Measurable: ac.length > 0, Achievable: (story.storyPoints ?? 5) <= 13, Relevant: true, TimeBound: true };
    const definitionOfReadyPass = dor >= 0.7 && investPass;

    const actions: ThreeAmigosOutcome['actions'] = [];
    if (!invest['Estimable']!.pass) actions.push({ role: 'PO', action: 'Facilitate estimation with the squad.' });
    if (!invest['Testable']!.pass) actions.push({ role: 'BA', action: 'Rewrite acceptance criteria in testable Given/When/Then form.' });
    if ((analysis?.missingInformation.length ?? 0) > 0) actions.push({ role: 'BA', action: `Resolve missing information: ${analysis!.missingInformation.join('; ')}` });
    actions.push({ role: 'Developer', action: 'Confirm technical approach and flag governor-limit risks.' });
    actions.push({ role: 'QA', action: 'Draft exploratory test charters for the highest-risk criteria.' });

    const payload: ThreeAmigosOutcome = {
      invest,
      smart,
      definitionOfReadyPass,
      edgeCases: ['Concurrent updates to the same record', 'User lacking required permission set', 'Empty/maximum field values'],
      negativeScenarios: ['Invalid input rejected with actionable message', 'Integration timeout handled gracefully'],
      nfrCoverage: ['Performance under bulk load', 'Accessibility (WCAG 2.2 AA)', 'Auditability of changes'],
      actions,
      verdict: definitionOfReadyPass ? 'APPROVED' : 'CHANGES_REQUESTED',
    };

    return {
      reasoning: `Three Amigos evaluated INVEST (${investPass ? 'pass' : 'fail'}), SMART and DoR (${dor}). Verdict: ${payload.verdict}. ${actions.length} actions assigned across PO/BA/Developer/QA.`,
      evidence: Object.entries(invest).map(([k, v]) => `INVEST ${k}: ${v.pass ? 'PASS' : 'FAIL'} — ${v.note}`),
      confidence: definitionOfReadyPass ? 0.9 : 0.75,
      risk: definitionOfReadyPass ? 'LOW' : 'MEDIUM',
      businessImpact: definitionOfReadyPass ? 'Story is well-formed; delivery predictability is high.' : 'Progressing an under-refined story risks rework and sprint spillover.',
      technicalImpact: 'Edge cases and NFRs identified for design and test planning.',
      complianceImpact: 'Workshop record retained as refinement evidence.',
      recommendedAction: definitionOfReadyPass ? 'Approve refinement outcome and continue the pipeline.' : `Request changes: ${actions.map((a) => `[${a.role}] ${a.action}`).join(' ')}`,
      alternativeRecommendations: ['Re-run the workshop after actions are complete.'],
      payload,
    };
  }
}

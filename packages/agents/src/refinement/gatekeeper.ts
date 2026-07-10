import type { StoryAnalysis } from '@qe-ai/contracts';
import { BaseAgent, type AgentContext, type AgentResult } from '@qe-ai/agent-kernel';
import { getDef } from './shared.js';
import type { ThreeAmigosOutcome } from './threeAmigos.js';
import type { FcaAssessment } from './fcaRegulatory.js';
import type { ConsumerDutyAssessment } from './consumerDuty.js';
import type { BddPack } from './bddDesigner.js';
import type { AutomationPlan } from './automationRecommendation.js';

export interface RefinementGateResult {
  passed: boolean;
  checks: Array<{ name: string; pass: boolean; detail: string }>;
}

export class RefinementGatekeeperAgent extends BaseAgent<RefinementGateResult> {
  constructor() {
    super(getDef('refinement-gatekeeper'));
  }

  protected async analyze(context: AgentContext): Promise<AgentResult<RefinementGateResult>> {
    const analysis = context.input['story-analysis'] as StoryAnalysis | undefined;
    const amigos = context.input['three-amigos'] as ThreeAmigosOutcome | undefined;
    const fca = context.input['fca-regulatory'] as FcaAssessment | undefined;
    const duty = context.input['consumer-duty'] as ConsumerDutyAssessment | undefined;
    const bdd = context.input['bdd-designer'] as BddPack | undefined;
    const automation = context.input['automation-recommendation'] as AutomationPlan | undefined;

    const checks: RefinementGateResult['checks'] = [
      { name: 'INVEST pass', pass: amigos ? Object.values(amigos.invest).every((v) => v.pass) : false, detail: amigos ? 'From Three Amigos workshop.' : 'Workshop output missing.' },
      { name: 'Definition of Ready', pass: (analysis?.definitionOfReadyScore ?? 0) >= 0.7, detail: `DoR score ${analysis?.definitionOfReadyScore ?? 'n/a'} (threshold 0.7).` },
      { name: 'BDD complete', pass: (bdd?.scenarios.length ?? 0) >= 5, detail: `${bdd?.scenarios.length ?? 0} scenarios generated.` },
      { name: 'Risk reviewed', pass: analysis !== undefined, detail: analysis ? `Business ${analysis.businessRisk}, technical ${analysis.technicalRisk}.` : 'Risk assessment missing.' },
      { name: 'Compliance passed', pass: fca !== undefined && duty !== undefined && (!fca.applicable || fca.mandatoryActions.length > 0), detail: fca?.applicable ? 'FCA obligations identified with mandatory actions routed.' : 'No FCA obligations triggered.' },
      { name: 'Automation reviewed', pass: automation !== undefined, detail: automation ? `${automation.automationPercent}% recommended for automation.` : 'Automation plan missing.' },
    ];
    const passed = checks.every((c) => c.pass);
    const confidence = Number((checks.filter((c) => c.pass).length / checks.length).toFixed(2));

    return {
      reasoning: `Refinement gate evaluated ${checks.length} criteria: ${checks.filter((c) => c.pass).length} passed. ${passed ? 'Story may progress to Development Ready pending human approval.' : `Blocked on: ${checks.filter((c) => !c.pass).map((c) => c.name).join(', ')}.`}`,
      evidence: checks.map((c) => `${c.name}: ${c.pass ? 'PASS' : 'FAIL'} — ${c.detail}`),
      confidence,
      risk: passed ? 'LOW' : 'HIGH',
      businessImpact: passed ? 'Story enters development with full refinement evidence.' : 'Progressing now would carry unresolved refinement risk.',
      technicalImpact: passed ? 'Development can rely on the BDD baseline and impact analysis.' : 'Technical scope remains uncertain.',
      complianceImpact: fca?.applicable ? 'Compliance approval is mandatory before release.' : 'No compliance obligations open.',
      recommendedAction: passed ? 'Approve Development Ready status.' : 'Return the story to refinement with the failed checks as actions.',
      alternativeRecommendations: ['Override with documented sign-off if the business accepts the risk.'],
      payload: { passed, checks },
    };
  }
}

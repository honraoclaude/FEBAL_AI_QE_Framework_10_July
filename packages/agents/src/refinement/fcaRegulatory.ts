import { BaseAgent, type AgentContext, type AgentResult } from '@qe-ai/agent-kernel';
import { getDef, storyFrom, text } from './shared.js';

export interface FcaAssessment {
  applicable: boolean;
  complianceRisks: string[];
  operationalResilience: string;
  financialPromotions: string;
  consumerProtection: string;
  governance: string;
  evidenceRequired: string[];
  mandatoryActions: string[];
}

export class FcaRegulatoryAgent extends BaseAgent<FcaAssessment> {
  constructor() {
    super(getDef('fca-regulatory'));
  }

  protected async analyze(context: AgentContext): Promise<AgentResult<FcaAssessment>> {
    const story = storyFrom(context);
    const t = text(story);
    const risks: string[] = [];
    if (/promotion|offer|advert|marketing/.test(t)) risks.push('Financial promotions: content must be fair, clear and not misleading (FCA CONC 3 / COBS 4).');
    if (/fee|charge|price|interest/.test(t)) risks.push('Price transparency: fee disclosures must be prominent and accurate.');
    if (/vulnerab/.test(t)) risks.push('Vulnerable customers: journey must support additional needs (FG21/1).');
    if (/complaint/.test(t)) risks.push('Complaints handling: DISP timescales and MI reporting apply.');
    if (/advice|recommend/.test(t)) risks.push('Advice boundary: ensure guidance does not constitute regulated advice.');
    if (/outage|resilience|failover|availability/.test(t)) risks.push('Operational resilience: impact tolerance for important business services (PS21/3).');
    const applicable = risks.length > 0;

    const payload: FcaAssessment = {
      applicable,
      complianceRisks: risks,
      operationalResilience: applicable ? 'Assess whether the change touches an important business service; document impact tolerances.' : 'No resilience-relevant change detected.',
      financialPromotions: risks.some((r) => r.startsWith('Financial promotions')) ? 'Promotion content requires compliance sign-off before release.' : 'Not applicable.',
      consumerProtection: applicable ? 'Confirm customer outcomes are not degraded; document the assessment.' : 'Not applicable.',
      governance: applicable ? 'SM&CR accountability: identify the accountable senior manager for this change.' : 'Standard change governance applies.',
      evidenceRequired: applicable ? ['Compliance review record', 'Test evidence for regulated journeys', 'Approval by Compliance Officer'] : [],
      mandatoryActions: applicable ? ['Route to Compliance Officer approval', 'Tag regulated scenarios @FCA in the BDD pack'] : [],
    };

    return {
      reasoning: applicable
        ? `Story matches ${risks.length} FCA-relevant concept(s). Compliance review and evidence capture are mandatory before release.`
        : 'No FCA-regulated concepts detected in the story; standard governance applies.',
      evidence: risks.length > 0 ? risks : ['Keyword scan across FCA concept lexicon returned no matches.'],
      confidence: 0.85,
      risk: applicable ? 'HIGH' : 'LOW',
      businessImpact: applicable ? 'Regulatory breach exposure if released without compliance evidence.' : 'None.',
      technicalImpact: applicable ? 'Regulated journeys need dedicated test scenarios and audit evidence.' : 'None.',
      complianceImpact: applicable ? `Mandatory actions: ${payload.mandatoryActions.join('; ')}` : 'No obligations triggered.',
      recommendedAction: applicable ? 'Hold release readiness until Compliance Officer approval is captured.' : 'Proceed; no FCA obligations triggered.',
      alternativeRecommendations: applicable ? ['Engage compliance early in-sprint rather than at the gate.'] : [],
      payload,
    };
  }
}

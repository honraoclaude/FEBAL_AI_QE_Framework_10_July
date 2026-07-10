import { BaseAgent, type AgentContext, type AgentResult } from '@qe-ai/agent-kernel';
import { getDef, storyFrom, text } from './shared.js';

export interface ConsumerDutyAssessment {
  outcomes: Record<'productsAndServices' | 'priceAndValue' | 'consumerUnderstanding' | 'consumerSupport', { rating: 'GOOD' | 'REVIEW' | 'AT_RISK'; note: string }>;
  vulnerableCustomers: string;
  fairJourney: string;
  recommendedActions: string[];
}

export class ConsumerDutyAgent extends BaseAgent<ConsumerDutyAssessment> {
  constructor() {
    super(getDef('consumer-duty'));
  }

  protected async analyze(context: AgentContext): Promise<AgentResult<ConsumerDutyAssessment>> {
    const story = storyFrom(context);
    const t = text(story);
    const customerFacing = /customer|client|portal|journey|self-?service|user/.test(t);
    const rating = (risky: boolean): 'GOOD' | 'REVIEW' | 'AT_RISK' => (!customerFacing ? 'GOOD' : risky ? 'REVIEW' : 'GOOD');

    const payload: ConsumerDutyAssessment = {
      outcomes: {
        productsAndServices: { rating: rating(/product|eligib/.test(t)), note: customerFacing ? 'Confirm the change keeps the product aligned to the target market.' : 'Internal change; outcome unaffected.' },
        priceAndValue: { rating: rating(/fee|price|charge/.test(t)), note: /fee|price|charge/.test(t) ? 'Pricing surface changes: reassess fair value.' : 'No pricing surface change.' },
        consumerUnderstanding: { rating: rating(/message|content|display|notification|letter|email/.test(t)), note: 'Customer-facing content must be tested for comprehension.' },
        consumerSupport: { rating: rating(/support|help|contact|complaint/.test(t)), note: 'Support paths must remain accessible throughout the journey.' },
      },
      vulnerableCustomers: customerFacing ? 'Include vulnerable-customer personas in UAT (accessibility, low digital confidence, financial distress).' : 'Not applicable to internal change.',
      fairJourney: customerFacing ? 'Verify no sludge practices are introduced (exit as easy as entry).' : 'Not applicable.',
      recommendedActions: customerFacing ? ['Tag customer-journey scenarios @ConsumerDuty', 'Capture comprehension-test evidence', 'Review journey with vulnerable-customer lens'] : [],
    };

    const reviews = Object.values(payload.outcomes).filter((o) => o.rating !== 'GOOD').length;
    return {
      reasoning: customerFacing
        ? `Customer-facing change: ${reviews}/4 Consumer Duty outcomes need explicit review. Actions raised for evidence capture.`
        : 'Internal change with no direct consumer journey impact; Consumer Duty obligations are not triggered.',
      evidence: Object.entries(payload.outcomes).map(([k, v]) => `${k}: ${v.rating} — ${v.note}`),
      confidence: 0.85,
      risk: reviews >= 2 ? 'MEDIUM' : 'LOW',
      businessImpact: customerFacing ? 'Consumer outcome evidence protects against FCA supervisory challenge.' : 'None.',
      technicalImpact: 'Scenario tagging drives compliance test selection.',
      complianceImpact: customerFacing ? 'Consumer Duty evidence must be captured before release.' : 'No obligations triggered.',
      recommendedAction: payload.recommendedActions.length > 0 ? payload.recommendedActions.join('; ') : 'Proceed; no Consumer Duty actions required.',
      alternativeRecommendations: [],
      payload,
    };
  }
}

import type { RiskLevel, StoryAnalysis } from '@qe-ai/contracts';
import { BaseAgent, type AgentContext, type AgentResult } from '@qe-ai/agent-kernel';
import { getDef, storyFrom, text } from './shared.js';

export class StoryAnalysisAgent extends BaseAgent<StoryAnalysis> {
  constructor() {
    super(getDef('story-analysis'));
  }

  protected async analyze(context: AgentContext): Promise<AgentResult<StoryAnalysis>> {
    const story = storyFrom(context);
    const ac = story.acceptanceCriteria;
    const hasDescription = story.description.trim().length >= 80;
    const hasPoints = typeof story.storyPoints === 'number';
    const testableAc = ac.filter((c) => c.testable).length;

    const missingInformation: string[] = [];
    if (!hasDescription) missingInformation.push('Description is too thin to establish business context.');
    if (ac.length === 0) missingInformation.push('No acceptance criteria defined.');
    if (ac.length > 0 && testableAc < ac.length) missingInformation.push(`${ac.length - testableAc} acceptance criteria are not phrased testably.`);
    if (!hasPoints) missingInformation.push('Story is not estimated.');

    const dorScore = Number(
      (
        (hasDescription ? 0.3 : 0.05) +
        (ac.length > 0 ? 0.3 : 0) +
        (ac.length > 0 ? (testableAc / Math.max(ac.length, 1)) * 0.2 : 0) +
        (hasPoints ? 0.2 : 0)
      ).toFixed(2),
    );
    const testabilityScore = ac.length === 0 ? 0.2 : Number((testableAc / ac.length).toFixed(2));
    const automationPotential = Number(Math.min(1, testabilityScore + 0.2).toFixed(2));
    const points = story.storyPoints ?? 5;
    const complexity = points <= 2 ? 'XS' : points <= 3 ? 'S' : points <= 5 ? 'M' : points <= 8 ? 'L' : 'XL';
    const businessRisk: RiskLevel = /payment|fee|regulat|complaint|vulnerab|advice/.test(text(story)) ? 'HIGH' : dorScore < 0.5 ? 'MEDIUM' : 'LOW';
    const technicalRisk: RiskLevel = points >= 8 ? 'HIGH' : /integration|api|mulesoft|migration/.test(text(story)) ? 'MEDIUM' : 'LOW';

    const analysis: StoryAnalysis = {
      storyId: story.id,
      businessSummary: `${story.title} — delivers ${story.description.split('.')[0] || 'the outcome described in the story'}.`,
      problemStatement: hasDescription
        ? `Users currently lack the capability described in "${story.title}"; the story closes that gap.`
        : 'Problem statement cannot be derived from the current description; refinement input needed.',
      businessValue: /customer|client|advisor|user/.test(text(story))
        ? 'Direct customer-facing value: improves the end-user journey and reduces manual effort.'
        : 'Operational value: improves internal efficiency, quality or compliance posture.',
      expectedOutcome: ac.length > 0 ? `All ${ac.length} acceptance criteria demonstrably satisfied in UAT and production.` : 'Outcome unclear until acceptance criteria are defined.',
      acceptanceCriteriaReview:
        ac.length === 0
          ? 'FAIL: no acceptance criteria.'
          : testableAc === ac.length
            ? `PASS: all ${ac.length} criteria are testable.`
            : `PARTIAL: ${testableAc}/${ac.length} criteria are testable; rewrite the rest in Given/When/Then form.`,
      dependencies: /mulesoft|api|integration/.test(text(story)) ? ['External integration availability', 'API contract sign-off'] : [],
      assumptions: ['Sandbox metadata is in parity with production.', 'Required permission sets are provisioned for test users.'],
      openQuestions: missingInformation.length > 0 ? ['What is the measurable success criterion for this story?'] : [],
      missingInformation,
      definitionOfReadyScore: dorScore,
      businessRisk,
      technicalRisk,
      complexity,
      testabilityScore,
      automationPotential,
    };

    const confidence = Number((0.55 + dorScore * 0.4).toFixed(2));
    return {
      reasoning: `Definition of Ready score ${dorScore}: description ${hasDescription ? 'adequate' : 'thin'}, ${ac.length} acceptance criteria (${testableAc} testable), ${hasPoints ? `estimated at ${story.storyPoints} points` : 'not estimated'}. Business risk ${businessRisk}, technical risk ${technicalRisk}, complexity ${complexity}.`,
      evidence: [
        `Acceptance criteria count: ${ac.length}`,
        `Testable criteria: ${testableAc}`,
        `Description length: ${story.description.length} chars`,
        `Story points: ${story.storyPoints ?? 'none'}`,
      ],
      confidence,
      risk: businessRisk,
      businessImpact: analysis.businessValue,
      technicalImpact: `Complexity ${complexity}; technical risk ${technicalRisk}.`,
      complianceImpact: businessRisk === 'HIGH' ? 'Story touches regulated concepts; route to FCA and Consumer Duty review.' : 'No regulated concepts detected in story text.',
      recommendedAction: dorScore >= 0.7 ? 'Story is refinement-ready; proceed to Three Amigos.' : `Resolve before Three Amigos: ${missingInformation.join(' ')}`,
      alternativeRecommendations: ['Split the story if complexity remains L/XL after refinement.'],
      payload: analysis,
    };
  }
}

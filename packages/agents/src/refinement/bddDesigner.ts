import type { GherkinScenario, ScenarioCategory, ScenarioTag } from '@qe-ai/contracts';
import { BaseAgent, newId, type AgentContext, type AgentResult } from '@qe-ai/agent-kernel';
import { getDef, storyFrom } from './shared.js';
import type { FcaAssessment } from './fcaRegulatory.js';
import type { ConsumerDutyAssessment } from './consumerDuty.js';

export interface BddPack {
  feature: string;
  scenarios: GherkinScenario[];
  coverage: { criteriaCovered: number; criteriaTotal: number };
}

const CATEGORY_TAGS: Record<ScenarioCategory, ScenarioTag[]> = {
  HAPPY_PATH: ['@Functional', '@Smoke', '@Automation'],
  NEGATIVE: ['@Functional', '@Regression', '@Automation'],
  BOUNDARY: ['@Functional', '@Regression', '@Unit'],
  INTEGRATION: ['@Integration', '@API', '@Regression'],
  REGRESSION: ['@Regression', '@Automation'],
  SECURITY: ['@Security', '@Regression'],
  ACCESSIBILITY: ['@Accessibility', '@UI'],
  PERFORMANCE: ['@Performance'],
  API: ['@API', '@Automation', '@Integration'],
  UI: ['@UI', '@Functional', '@Automation'],
  END_TO_END: ['@E2E', '@Regression'],
};

export class BddDesignerAgent extends BaseAgent<BddPack> {
  constructor() {
    super(getDef('bdd-designer'));
  }

  protected async analyze(context: AgentContext): Promise<AgentResult<BddPack>> {
    const story = storyFrom(context);
    const fca = (context.input['fca-regulatory'] as FcaAssessment | undefined)?.applicable ?? false;
    const duty = ((context.input['consumer-duty'] as ConsumerDutyAssessment | undefined)?.recommendedActions.length ?? 0) > 0;
    const scenarios: GherkinScenario[] = [];

    const make = (title: string, category: ScenarioCategory, given: string[], when: string[], then: string[], acIds: string[] = []): GherkinScenario => {
      const tags = [...CATEGORY_TAGS[category]];
      if (fca) tags.push('@FCA');
      if (duty) tags.push('@ConsumerDuty');
      return {
        id: newId('scn'),
        tenantId: context.tenantId,
        storyId: story.id,
        feature: story.title,
        title,
        category,
        tags: [...new Set(tags)],
        given,
        when,
        then,
        automationCandidate: category !== 'ACCESSIBILITY' && category !== 'PERFORMANCE',
        acceptanceCriterionIds: acIds,
      };
    };

    for (const criterion of story.acceptanceCriteria) {
      const base = criterion.text.replace(/\.$/, '');
      scenarios.push(
        make(`Happy path — ${base}`, 'HAPPY_PATH', [`a user with the required permissions`, `the preconditions for "${base}" are met`], [`the user performs the action described by the criterion`], [`${base}`, 'an audit record is written'], [criterion.id]),
        make(`Negative — ${base} with invalid input`, 'NEGATIVE', ['a user with the required permissions'], ['the user submits invalid or incomplete input'], ['the action is rejected with an actionable validation message', 'no partial data is persisted'], [criterion.id]),
        make(`Boundary — ${base} at limits`, 'BOUNDARY', ['records at the volume/length limits of the criterion'], ['the user performs the action at the boundary'], ['behaviour matches the specification at minimum and maximum values'], [criterion.id]),
      );
    }

    scenarios.push(
      make('Integration — downstream systems stay consistent', 'INTEGRATION', ['connected systems are available'], ['the story journey completes'], ['downstream records are consistent', 'integration failures surface a retriable error']),
      make('Security — unauthorised access is prevented', 'SECURITY', ['a user without the required permission set'], ['the user attempts the journey'], ['access is denied and the attempt is logged']),
      make('Accessibility — journey meets WCAG 2.2 AA', 'ACCESSIBILITY', ['a keyboard-only user with a screen reader'], ['the user completes the journey'], ['all interactive elements are reachable and announced']),
      make('Performance — journey meets response SLO', 'PERFORMANCE', ['production-like data volumes'], ['the journey executes under expected concurrency'], ['p95 response time is within the agreed SLO']),
      make('API — contract honoured', 'API', ['the public API contract for this capability'], ['a consumer calls the API with valid and invalid payloads'], ['responses match the contract including error shapes']),
      make('UI — journey renders and validates correctly', 'UI', ['a supported browser at desktop and mobile widths'], ['the user completes the journey'], ['layout, validation and messaging behave as designed']),
      make('End-to-end — full business journey', 'END_TO_END', ['all integrated systems in a production-like environment'], ['the complete business journey executes'], ['the business outcome is achieved and observable in reporting']),
      make('Regression — adjacent journeys unaffected', 'REGRESSION', ['the regression pack for impacted areas'], ['the impacted regression pack executes'], ['no previously passing scenario fails']),
    );

    const payload: BddPack = {
      feature: story.title,
      scenarios,
      coverage: { criteriaCovered: story.acceptanceCriteria.length, criteriaTotal: story.acceptanceCriteria.length },
    };

    return {
      reasoning: `Generated ${scenarios.length} Gherkin scenarios: ${story.acceptanceCriteria.length * 3} criterion-derived (happy/negative/boundary) plus 8 cross-cutting (integration, security, accessibility, performance, API, UI, E2E, regression).${fca ? ' Tagged @FCA.' : ''}${duty ? ' Tagged @ConsumerDuty.' : ''}`,
      evidence: scenarios.slice(0, 6).map((s) => `${s.category}: ${s.title}`),
      confidence: story.acceptanceCriteria.length > 0 ? 0.9 : 0.6,
      risk: story.acceptanceCriteria.length > 0 ? 'LOW' : 'MEDIUM',
      businessImpact: 'Executable specification aligns the squad on behaviour before development.',
      technicalImpact: `${scenarios.filter((s) => s.automationCandidate).length}/${scenarios.length} scenarios are automation candidates.`,
      complianceImpact: fca || duty ? 'Regulated scenarios tagged for compliance evidence.' : 'No compliance tagging required.',
      recommendedAction: 'Review the scenario pack in Three Amigos follow-up and approve as the BDD baseline.',
      alternativeRecommendations: ['Add exploratory charters for areas with low scenario confidence.'],
      payload,
    };
  }
}

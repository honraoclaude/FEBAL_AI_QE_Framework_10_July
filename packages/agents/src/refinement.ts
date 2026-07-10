import type {
  AgentDefinition,
  GherkinScenario,
  RiskLevel,
  ScenarioCategory,
  ScenarioTag,
  StoryAnalysis,
} from '@qe-ai/contracts';
import { BaseAgent, newId, type AgentContext, type AgentResult } from '@qe-ai/agent-kernel';
import { REFINEMENT_AGENTS } from './catalog.js';
import { scoreToRisk, stableScore } from './heuristics.js';

/** Shape of the story object placed in workflow context by the API layer. */
export interface StoryInput {
  id: string;
  jiraKey: string;
  title: string;
  description: string;
  storyPoints?: number;
  labels: string[];
  acceptanceCriteria: Array<{ id: string; text: string; testable: boolean }>;
}

function getDef(id: string): AgentDefinition {
  const definition = REFINEMENT_AGENTS.find((d) => d.id === id);
  if (!definition) throw new Error(`Missing refinement definition: ${id}`);
  return definition;
}

function storyFrom(context: AgentContext): StoryInput {
  const story = context.input['story'] as StoryInput | undefined;
  if (story) return story;
  return {
    id: context.subjectId,
    jiraKey: context.subjectId,
    title: context.subjectId,
    description: '',
    labels: [],
    acceptanceCriteria: [],
  };
}

function text(story: StoryInput): string {
  return `${story.title} ${story.description} ${story.labels.join(' ')}`.toLowerCase();
}

// ---------------------------------------------------------------------------
// 1. Story Analysis Agent
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 2. Salesforce Impact Analysis Agent
// ---------------------------------------------------------------------------

interface ImpactArea {
  area: string;
  impacted: boolean;
  rationale: string;
}

export interface SalesforceImpact {
  areas: ImpactArea[];
  regressionScope: string[];
  metadataDependencies: string[];
  impactedCount: number;
}

const IMPACT_RULES: Array<{ area: string; pattern: RegExp }> = [
  { area: 'Financial Services Cloud', pattern: /fsc|financial|account|household|advisor|client/ },
  { area: 'Sales Cloud', pattern: /opportunity|lead|quote|sales|pipeline/ },
  { area: 'Marketing Cloud', pattern: /campaign|journey|email|marketing|promotion/ },
  { area: 'Service Cloud', pattern: /case|complaint|service|support|omni-?channel/ },
  { area: 'Experience Cloud', pattern: /portal|community|experience|self-?service|customer.*(login|site)/ },
  { area: 'Data Cloud', pattern: /segment|cdp|data cloud|profile unification/ },
  { area: 'Apex', pattern: /apex|trigger|batch|queueable|controller|calculation|logic/ },
  { area: 'Flows', pattern: /flow|automation|process/ },
  { area: 'LWC', pattern: /component|lwc|screen|page|ui|form/ },
  { area: 'Validation Rules', pattern: /validation|mandatory|required field/ },
  { area: 'Profiles & Permission Sets', pattern: /permission|profile|access|role/ },
  { area: 'Sharing Rules', pattern: /sharing|visibility|record access/ },
  { area: 'OmniStudio', pattern: /omniscript|omnistudio|dataraptor|integration procedure/ },
  { area: 'CPQ', pattern: /cpq|pricing|quote|discount/ },
  { area: 'MuleSoft', pattern: /mulesoft|mule|api-?led|integration/ },
  { area: 'External APIs', pattern: /external|third.?party|rest|soap|webhook|api/ },
];

export class SalesforceImpactAgent extends BaseAgent<SalesforceImpact> {
  constructor() {
    super(getDef('salesforce-impact'));
  }

  protected async analyze(context: AgentContext): Promise<AgentResult<SalesforceImpact>> {
    const story = storyFrom(context);
    const t = text(story);
    const areas: ImpactArea[] = IMPACT_RULES.map(({ area, pattern }) => {
      const impacted = pattern.test(t);
      return {
        area,
        impacted,
        rationale: impacted ? `Story language matches ${area} concepts (${pattern.source.split('|')[0]}…).` : 'No signal in story text.',
      };
    });
    const impacted = areas.filter((a) => a.impacted);
    const regressionScope = impacted.map((a) => `${a.area} regression pack`);
    const metadataDependencies = impacted.flatMap((a) =>
      a.area === 'Apex' ? ['Classes', 'Triggers'] : a.area === 'Flows' ? ['Flow definitions'] : a.area === 'LWC' ? ['LightningComponentBundles'] : [],
    );

    const payload: SalesforceImpact = {
      areas,
      regressionScope: regressionScope.length > 0 ? regressionScope : ['Core smoke pack'],
      metadataDependencies,
      impactedCount: impacted.length,
    };
    const risk: RiskLevel = impacted.length >= 6 ? 'HIGH' : impacted.length >= 3 ? 'MEDIUM' : 'LOW';

    return {
      reasoning: `Detected ${impacted.length}/${areas.length} impacted Salesforce areas: ${impacted.map((a) => a.area).join(', ') || 'none beyond core smoke scope'}. Regression scope derived from impacted areas.`,
      evidence: impacted.map((a) => a.rationale),
      confidence: impacted.length > 0 ? 0.85 : 0.7,
      risk,
      businessImpact: impacted.length >= 3 ? 'Broad functional surface; coordinate cross-cloud stakeholders.' : 'Contained functional surface.',
      technicalImpact: `Regression scope: ${payload.regressionScope.join(', ')}.`,
      complianceImpact: 'Impact analysis informs regulated-journey regression selection.',
      recommendedAction: `Include ${payload.regressionScope.join(', ')} in the test plan; verify metadata dependencies (${metadataDependencies.join(', ') || 'none'}).`,
      alternativeRecommendations: ['Run full regression if release window allows.'],
      payload,
    };
  }
}

// ---------------------------------------------------------------------------
// 3. Three Amigos Agent
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 4. FCA Regulatory Agent
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 5. Consumer Duty Agent
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 6. BDD Test Designer Agent
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 7. Automation Recommendation Agent
// ---------------------------------------------------------------------------

export interface AutomationPlan {
  recommendations: Array<{
    scenarioId: string;
    title: string;
    automate: boolean;
    roiScore: number;
    priority: 'P1' | 'P2' | 'P3';
    framework: string;
    complexity: 'LOW' | 'MEDIUM' | 'HIGH';
    maintenanceCost: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
  automationPercent: number;
}

export class AutomationRecommendationAgent extends BaseAgent<AutomationPlan> {
  constructor() {
    super(getDef('automation-recommendation'));
  }

  protected async analyze(context: AgentContext): Promise<AgentResult<AutomationPlan>> {
    const pack = context.input['bdd-designer'] as BddPack | undefined;
    const scenarios = pack?.scenarios ?? [];

    const recommendations = scenarios.map((s) => {
      const base = s.automationCandidate ? 0.6 : 0.2;
      const regressionBoost = s.tags.includes('@Regression') || s.tags.includes('@Smoke') ? 0.25 : 0;
      const roiScore = Number(Math.min(1, base + regressionBoost + stableScore('roi', s.id) * 0.15).toFixed(2));
      const framework = s.category === 'API' || s.category === 'INTEGRATION' ? 'RestAssured + Karate' : s.category === 'UI' || s.category === 'END_TO_END' ? 'Playwright (Salesforce-aware selectors)' : s.category === 'PERFORMANCE' ? 'k6' : s.tags.includes('@Unit') ? 'Apex Test Framework' : 'Playwright + Cucumber';
      const complexity = s.category === 'END_TO_END' || s.category === 'INTEGRATION' ? 'HIGH' : s.category === 'UI' ? 'MEDIUM' : 'LOW';
      return {
        scenarioId: s.id,
        title: s.title,
        automate: roiScore >= 0.55,
        roiScore,
        priority: (roiScore >= 0.8 ? 'P1' : roiScore >= 0.6 ? 'P2' : 'P3') as 'P1' | 'P2' | 'P3',
        framework,
        complexity: complexity as 'LOW' | 'MEDIUM' | 'HIGH',
        maintenanceCost: (complexity === 'HIGH' ? 'MEDIUM' : 'LOW') as 'LOW' | 'MEDIUM' | 'HIGH',
      };
    });
    const automationPercent = recommendations.length === 0 ? 0 : Math.round((recommendations.filter((r) => r.automate).length / recommendations.length) * 100);

    return {
      reasoning: `Scored ${recommendations.length} scenarios for automation ROI; ${recommendations.filter((r) => r.automate).length} recommended (${automationPercent}%). Frameworks selected per scenario category.`,
      evidence: recommendations.slice(0, 5).map((r) => `${r.title}: ROI ${r.roiScore}, ${r.priority}, ${r.framework}`),
      confidence: recommendations.length > 0 ? 0.85 : 0.5,
      risk: 'LOW',
      businessImpact: `Target automation coverage of ${automationPercent}% reduces regression cost per release.`,
      technicalImpact: 'Framework mix: Playwright, Karate/RestAssured, Apex tests, k6.',
      complianceImpact: 'Automated regulated scenarios produce repeatable compliance evidence.',
      recommendedAction: `Automate the ${recommendations.filter((r) => r.priority === 'P1').length} P1 scenarios in-sprint; schedule P2 next sprint.`,
      alternativeRecommendations: ['Defer P3 automation until stability data accumulates.'],
      payload: { recommendations, automationPercent },
    };
  }
}

// ---------------------------------------------------------------------------
// 8. Refinement Gatekeeper
// ---------------------------------------------------------------------------

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

export function createRefinementAgents() {
  return [
    new StoryAnalysisAgent(),
    new SalesforceImpactAgent(),
    new ThreeAmigosAgent(),
    new FcaRegulatoryAgent(),
    new ConsumerDutyAgent(),
    new BddDesignerAgent(),
    new AutomationRecommendationAgent(),
    new RefinementGatekeeperAgent(),
  ];
}

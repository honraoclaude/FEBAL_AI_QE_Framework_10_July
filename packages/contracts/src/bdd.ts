import type { TenantId } from './tenancy.js';

/** BDD scenario model produced by the BDD Test Designer agent. */

export type ScenarioTag =
  | '@Unit'
  | '@Functional'
  | '@Regression'
  | '@Smoke'
  | '@Sanity'
  | '@API'
  | '@UI'
  | '@Automation'
  | '@Performance'
  | '@Security'
  | '@Accessibility'
  | '@Integration'
  | '@E2E'
  | '@ConsumerDuty'
  | '@FCA';

export type ScenarioCategory =
  | 'HAPPY_PATH'
  | 'NEGATIVE'
  | 'BOUNDARY'
  | 'INTEGRATION'
  | 'REGRESSION'
  | 'SECURITY'
  | 'ACCESSIBILITY'
  | 'PERFORMANCE'
  | 'API'
  | 'UI'
  | 'END_TO_END';

export interface GherkinScenario {
  id: string;
  tenantId: TenantId;
  storyId: string;
  feature: string;
  title: string;
  category: ScenarioCategory;
  tags: ScenarioTag[];
  given: string[];
  when: string[];
  then: string[];
  automationCandidate: boolean;
  acceptanceCriterionIds: string[];
}

export interface TestExecution {
  id: string;
  tenantId: TenantId;
  scenarioId: string;
  storyId: string;
  suite: 'UNIT' | 'FUNCTIONAL' | 'REGRESSION' | 'SMOKE' | 'E2E' | 'API' | 'UI';
  result: 'PASSED' | 'FAILED' | 'BLOCKED' | 'SKIPPED';
  durationMs: number;
  environment: string;
  executedAt: string;
  defectKey?: string;
}

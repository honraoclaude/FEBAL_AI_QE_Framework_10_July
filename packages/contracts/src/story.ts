import type { TenantId } from './tenancy.js';

/** Work item hierarchy mirrored from JIRA and enriched by agents. */

export type WorkItemType = 'EPIC' | 'FEATURE' | 'STORY' | 'TASK' | 'SUBTASK' | 'BUG';

export type StoryLifecycleStage =
  | 'BACKLOG'
  | 'REFINEMENT'
  | 'DEVELOPMENT_READY'
  | 'DEVELOPMENT'
  | 'TESTING_READY'
  | 'TESTING'
  | 'RELEASE_READY'
  | 'RELEASE'
  | 'DEPLOYED'
  | 'LEARNING';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AcceptanceCriterion {
  id: string;
  text: string;
  testable: boolean;
  coveredByScenarioIds: string[];
}

export interface WorkItem {
  id: string;
  tenantId: TenantId;
  jiraKey: string;
  type: WorkItemType;
  parentId?: string;
  title: string;
  description: string;
  status: string;
  stage: StoryLifecycleStage;
  storyPoints?: number;
  sprintId?: string;
  labels: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  linkedPullRequests: string[];
  linkedDefectKeys: string[];
  linkedTestCaseIds: string[];
  assignee?: string;
  updatedAt: string;
  createdAt: string;
}

export interface Sprint {
  id: string;
  tenantId: TenantId;
  jiraId: string;
  name: string;
  goal: string;
  state: 'FUTURE' | 'ACTIVE' | 'CLOSED';
  startDate: string;
  endDate: string;
}

/** Enrichment produced by refinement agents, attached to a story. */
export interface StoryAnalysis {
  storyId: string;
  businessSummary: string;
  problemStatement: string;
  businessValue: string;
  expectedOutcome: string;
  acceptanceCriteriaReview: string;
  dependencies: string[];
  assumptions: string[];
  openQuestions: string[];
  missingInformation: string[];
  definitionOfReadyScore: number;
  businessRisk: RiskLevel;
  technicalRisk: RiskLevel;
  complexity: 'XS' | 'S' | 'M' | 'L' | 'XL';
  testabilityScore: number;
  automationPotential: number;
}

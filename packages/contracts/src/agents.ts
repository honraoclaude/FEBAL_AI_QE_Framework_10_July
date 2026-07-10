import type { RiskLevel } from './story.js';
import type { Role, TenantId } from './tenancy.js';

/** Agent catalog, decisions and the AI governance envelope. */

export type AgentPhase =
  | 'REFINEMENT'
  | 'DEVELOPMENT'
  | 'TESTING'
  | 'RELEASE'
  | 'DEPLOY_LEARN'
  | 'GLOBAL';

export type AgentStatus = 'IDLE' | 'RUNNING' | 'DEGRADED' | 'ERROR' | 'DISABLED';

export interface AgentDefinition {
  /** Stable kebab-case identifier, e.g. `story-analysis`. */
  id: string;
  name: string;
  phase: AgentPhase;
  description: string;
  /** What the agent consumes and produces — used for orchestration wiring and docs. */
  inputs: string[];
  outputs: string[];
  /** Prompt template id resolved through the prompt library (versioned). */
  promptId: string;
  /** True when the agent blocks progression (gatekeepers). */
  gatekeeper: boolean;
  /** Roles allowed to approve/override this agent's decisions. */
  approverRoles: Role[];
  tags: string[];
}

/**
 * Governance envelope: every agent decision is emitted in this shape.
 * Nothing an agent produces is actionable without it.
 */
export interface AgentDecision<TPayload = unknown> {
  id: string;
  tenantId: TenantId;
  agentId: string;
  workflowRunId?: string;
  stepId?: string;
  subjectType: 'STORY' | 'EPIC' | 'RELEASE' | 'DEPLOYMENT' | 'PLATFORM';
  subjectId: string;
  reasoning: string;
  evidence: string[];
  confidence: number;
  risk: RiskLevel;
  businessImpact: string;
  technicalImpact: string;
  complianceImpact: string;
  recommendedAction: string;
  alternativeRecommendations: string[];
  approver?: string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_APPROVED';
  payload: TPayload;
  promptVersion: string;
  llmVersion: string;
  knowledgeVersion: string;
  createdAt: string;
  version: number;
}

export interface AgentHealth {
  agentId: string;
  status: AgentStatus;
  lastRunAt?: string;
  runsToday: number;
  failuresToday: number;
  avgLatencyMs: number;
  avgConfidence: number;
  tokenCostTodayUsd: number;
}

/** Feedback captured on every AI recommendation to close the learning loop. */
export interface DecisionFeedback {
  id: string;
  tenantId: TenantId;
  decisionId: string;
  outcome: 'ACCEPTED' | 'REJECTED' | 'MODIFIED';
  reviewerId: string;
  reviewerComments?: string;
  learningOutcome?: string;
  createdAt: string;
}

import type { AgentPhase } from './agents.js';
import type { TenantId } from './tenancy.js';

/** Configurable multi-agent workflow definitions and runtime state. */

export interface WorkflowStep {
  id: string;
  agentId: string;
  /** Steps sharing the same `parallelGroup` execute concurrently. */
  parallelGroup?: string;
  /** Ids of steps that must complete before this one starts (defaults to previous step). */
  dependsOn?: string[];
  maxRetries: number;
  /** When true, the workflow pauses here until a human approval resolves. */
  humanApproval?: boolean;
  continueOnFailure?: boolean;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  phase: AgentPhase;
  description: string;
  steps: WorkflowStep[];
  version: number;
}

export type WorkflowRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PAUSED'
  | 'AWAITING_APPROVAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'ROLLED_BACK'
  | 'CANCELLED';

export type StepRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'RETRYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED'
  | 'AWAITING_APPROVAL';

export interface StepRun {
  stepId: string;
  agentId: string;
  status: StepRunStatus;
  attempts: number;
  decisionId?: string;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface WorkflowRun {
  id: string;
  tenantId: TenantId;
  definitionId: string;
  definitionVersion: number;
  subjectType: 'STORY' | 'EPIC' | 'RELEASE' | 'DEPLOYMENT' | 'PLATFORM';
  subjectId: string;
  status: WorkflowRunStatus;
  steps: StepRun[];
  /** Accumulated context passed from step to step. */
  context: Record<string, unknown>;
  startedAt: string;
  finishedAt?: string;
  triggeredBy: string;
}

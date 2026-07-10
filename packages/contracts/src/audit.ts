import type { TenantId } from './tenancy.js';

/** Immutable audit trail. Events are append-only and hash-chained. */

export type AuditEventKind =
  | 'AGENT_DECISION'
  | 'WORKFLOW_STARTED'
  | 'WORKFLOW_STEP'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_FAILED'
  | 'WORKFLOW_ROLLED_BACK'
  | 'APPROVAL_REQUESTED'
  | 'APPROVAL_RESOLVED'
  | 'DECISION_STATUS_CHANGED'
  | 'JIRA_SYNC'
  | 'KNOWLEDGE_UPDATED'
  | 'FEEDBACK_RECORDED'
  | 'CONFIG_CHANGED'
  | 'NOTIFICATION_SENT';

export interface AuditEvent {
  id: string;
  tenantId: TenantId;
  seq: number;
  kind: AuditEventKind;
  actor: string;
  workflowRunId?: string;
  agentId?: string;
  decisionId?: string;
  promptVersion?: string;
  llmVersion?: string;
  knowledgeVersion?: string;
  subjectType?: string;
  subjectId?: string;
  summary: string;
  /** Redacted structured detail — inputs, outputs, changes, evidence, comments. */
  detail: Record<string, unknown>;
  timestamp: string;
  /** SHA-256 of (previousHash + canonical event body) — makes the trail tamper-evident. */
  hash: string;
  previousHash: string;
}

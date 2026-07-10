import type { ApprovalType, Role, TenantId, UserId } from './tenancy.js';

/** Human approval framework. */

export type ApprovalStatus =
  | 'DRAFT'
  | 'REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CHANGES_REQUESTED'
  | 'REOPENED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface ApprovalRequest {
  id: string;
  tenantId: TenantId;
  type: ApprovalType;
  title: string;
  status: ApprovalStatus;
  subjectType: 'STORY' | 'EPIC' | 'RELEASE' | 'DEPLOYMENT' | 'PLATFORM';
  subjectId: string;
  decisionId?: string;
  workflowRunId?: string;
  requiredRoles: Role[];
  requestedBy: string;
  assignee?: UserId;
  resolvedBy?: UserId;
  comments: ApprovalComment[];
  createdAt: string;
  resolvedAt?: string;
  expiresAt?: string;
}

export interface ApprovalComment {
  authorId: string;
  text: string;
  createdAt: string;
}

/** Configurable role-based approval matrix: which roles may approve which type. */
export type ApprovalMatrix = Record<ApprovalType, Role[]>;

export const DEFAULT_APPROVAL_MATRIX: ApprovalMatrix = {
  STORY: ['PRODUCT_OWNER', 'BUSINESS_ANALYST'],
  BDD: ['QA_ENGINEER', 'QE_LEAD'],
  ARCHITECTURE: ['ARCHITECT'],
  CODE: ['DEVELOPER', 'ENGINEERING_MANAGER'],
  SECURITY: ['SECURITY_LEAD'],
  COMPLIANCE: ['COMPLIANCE_OFFICER'],
  AUTOMATION: ['QE_LEAD'],
  REGRESSION: ['QE_LEAD', 'QA_ENGINEER'],
  RELEASE: ['RELEASE_MANAGER'],
  DEPLOYMENT: ['RELEASE_MANAGER', 'ENGINEERING_MANAGER'],
  DOCUMENTATION: ['BUSINESS_ANALYST', 'QE_LEAD'],
  KNOWLEDGE_UPDATE: ['QE_LEAD', 'ARCHITECT'],
};

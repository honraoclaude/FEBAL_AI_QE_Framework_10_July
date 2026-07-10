/** Multi-tenant identity and access model. */

export type TenantId = string;
export type UserId = string;

export type Role =
  | 'PRODUCT_OWNER'
  | 'BUSINESS_ANALYST'
  | 'DEVELOPER'
  | 'QA_ENGINEER'
  | 'QE_LEAD'
  | 'ARCHITECT'
  | 'SECURITY_LEAD'
  | 'COMPLIANCE_OFFICER'
  | 'RELEASE_MANAGER'
  | 'ENGINEERING_MANAGER'
  | 'ADMIN';

export const ALL_ROLES: readonly Role[] = [
  'PRODUCT_OWNER',
  'BUSINESS_ANALYST',
  'DEVELOPER',
  'QA_ENGINEER',
  'QE_LEAD',
  'ARCHITECT',
  'SECURITY_LEAD',
  'COMPLIANCE_OFFICER',
  'RELEASE_MANAGER',
  'ENGINEERING_MANAGER',
  'ADMIN',
];

export interface Tenant {
  id: TenantId;
  name: string;
  plan: 'TRIAL' | 'TEAM' | 'ENTERPRISE';
  region: string;
  createdAt: string;
  settings: TenantSettings;
}

export interface TenantSettings {
  /** Minimum agent confidence (0..1) required to pass a phase gate without escalation. */
  gateConfidenceThreshold: number;
  /** Which approval types require a human decision. */
  humanApprovalRequired: ApprovalType[];
  /** LLM provider selection. 'simulated' runs the platform with deterministic offline inference. */
  llmProvider: 'anthropic' | 'simulated';
  llmModel: string;
  dataResidency: 'UK' | 'EU' | 'US';
  regulatoryProfiles: Array<'FCA' | 'CONSUMER_DUTY' | 'GDPR'>;
}

export interface User {
  id: UserId;
  tenantId: TenantId;
  email: string;
  displayName: string;
  roles: Role[];
  active: boolean;
}

export type ApprovalType =
  | 'STORY'
  | 'BDD'
  | 'ARCHITECTURE'
  | 'CODE'
  | 'SECURITY'
  | 'COMPLIANCE'
  | 'AUTOMATION'
  | 'REGRESSION'
  | 'RELEASE'
  | 'DEPLOYMENT'
  | 'DOCUMENTATION'
  | 'KNOWLEDGE_UPDATE';

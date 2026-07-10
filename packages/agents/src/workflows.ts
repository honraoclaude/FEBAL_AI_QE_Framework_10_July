import type { WorkflowDefinition } from '@qe-ai/contracts';

/**
 * Default phase workflows, mirroring the product specification. Workflows are
 * configuration: tenants can clone and adjust step order, parallelism,
 * retries and approval points without code changes.
 */

export const REFINEMENT_WORKFLOW: WorkflowDefinition = {
  id: 'refinement',
  name: 'Refinement Pipeline',
  phase: 'REFINEMENT',
  description: 'JIRA-synced story → analysis → impact → Three Amigos → compliance → BDD → automation → gate → human approval → Development Ready.',
  version: 1,
  steps: [
    { id: 'story-analysis', agentId: 'story-analysis', maxRetries: 1 },
    { id: 'salesforce-impact', agentId: 'salesforce-impact', maxRetries: 1 },
    { id: 'three-amigos', agentId: 'three-amigos', maxRetries: 1 },
    { id: 'fca-review', agentId: 'fca-regulatory', maxRetries: 1, parallelGroup: 'compliance' },
    { id: 'consumer-duty-review', agentId: 'consumer-duty', maxRetries: 1, parallelGroup: 'compliance' },
    { id: 'bdd-generation', agentId: 'bdd-designer', maxRetries: 1 },
    { id: 'automation-recommendation', agentId: 'automation-recommendation', maxRetries: 1 },
    { id: 'refinement-gate', agentId: 'refinement-gatekeeper', maxRetries: 0, humanApproval: true },
  ],
};

export const DEVELOPMENT_WORKFLOW: WorkflowDefinition = {
  id: 'development',
  name: 'Development Pipeline',
  phase: 'DEVELOPMENT',
  description: 'Code generation → architecture validation → code/security/performance review → unit tests → coverage → gate → human approval → Testing Ready.',
  version: 1,
  steps: [
    { id: 'code-generation', agentId: 'apex-code-generator', maxRetries: 1 },
    { id: 'architecture-validation', agentId: 'architecture-validator', maxRetries: 1 },
    { id: 'code-review', agentId: 'code-review', maxRetries: 1, parallelGroup: 'review' },
    { id: 'security-review', agentId: 'secure-coding', maxRetries: 1, parallelGroup: 'review' },
    { id: 'performance-review', agentId: 'performance-optimizer', maxRetries: 1, parallelGroup: 'review' },
    { id: 'unit-test-generation', agentId: 'apex-unit-test-generator', maxRetries: 1 },
    { id: 'coverage-analysis', agentId: 'coverage-analyzer', maxRetries: 1 },
    { id: 'development-gate', agentId: 'development-gatekeeper', maxRetries: 0, humanApproval: true },
  ],
};

export const TESTING_WORKFLOW: WorkflowDefinition = {
  id: 'testing',
  name: 'Testing Pipeline',
  phase: 'TESTING',
  description: 'Environment validation → test data → regression selection → parallel functional/security/performance/accessibility → compliance → execution → defect analysis → RCA → gate.',
  version: 1,
  steps: [
    { id: 'environment-validation', agentId: 'environment-readiness', maxRetries: 2 },
    { id: 'test-data', agentId: 'test-data-management', maxRetries: 1 },
    { id: 'regression-selection', agentId: 'regression-selection', maxRetries: 1 },
    { id: 'api-testing', agentId: 'api-testing', maxRetries: 1, parallelGroup: 'suites' },
    { id: 'ui-testing', agentId: 'ui-testing', maxRetries: 1, parallelGroup: 'suites' },
    { id: 'security-testing', agentId: 'security-testing', maxRetries: 1, parallelGroup: 'suites' },
    { id: 'performance-testing', agentId: 'performance-testing', maxRetries: 1, parallelGroup: 'suites' },
    { id: 'accessibility-testing', agentId: 'accessibility-testing', maxRetries: 1, parallelGroup: 'suites' },
    { id: 'compliance-testing', agentId: 'compliance-testing', maxRetries: 1 },
    { id: 'automation-execution', agentId: 'automation-execution', maxRetries: 2 },
    { id: 'defect-analysis', agentId: 'defect-triage', maxRetries: 1 },
    { id: 'root-cause', agentId: 'root-cause-analysis', maxRetries: 1 },
    { id: 'testing-gate', agentId: 'testing-gatekeeper', maxRetries: 0, humanApproval: true },
  ],
};

export const RELEASE_WORKFLOW: WorkflowDefinition = {
  id: 'release',
  name: 'Release Pipeline',
  phase: 'RELEASE',
  description: 'Release readiness → risk assessment → business communication → release notes → deployment approval → gate → deploy.',
  version: 1,
  steps: [
    { id: 'release-readiness', agentId: 'release-readiness', maxRetries: 1 },
    { id: 'risk-assessment', agentId: 'release-risk-assessment', maxRetries: 1 },
    { id: 'business-communication', agentId: 'business-communication-generator', maxRetries: 1, parallelGroup: 'comms' },
    { id: 'release-notes', agentId: 'release-notes-generator', maxRetries: 1, parallelGroup: 'comms' },
    { id: 'rollback-readiness', agentId: 'rollback-readiness', maxRetries: 1 },
    { id: 'deployment-approval', agentId: 'deployment-approval', maxRetries: 0 },
    { id: 'release-gate', agentId: 'release-gatekeeper', maxRetries: 0, humanApproval: true },
  ],
};

export const DEPLOY_LEARN_WORKFLOW: WorkflowDefinition = {
  id: 'deploy-learn',
  name: 'Deploy & Learn Pipeline',
  phase: 'DEPLOY_LEARN',
  description: 'CI/CD → production validation → monitoring → observability → incident detection → knowledge update → documentation → learning → metrics → continuous improvement.',
  version: 1,
  steps: [
    { id: 'cicd', agentId: 'cicd', maxRetries: 2 },
    { id: 'deployment', agentId: 'deployment', maxRetries: 1 },
    { id: 'production-validation', agentId: 'production-validation', maxRetries: 2 },
    { id: 'monitoring', agentId: 'monitoring', maxRetries: 1, parallelGroup: 'observe' },
    { id: 'observability', agentId: 'observability', maxRetries: 1, parallelGroup: 'observe' },
    { id: 'incident-detection', agentId: 'incident-detection', maxRetries: 1 },
    { id: 'knowledge-update', agentId: 'knowledge-learning', maxRetries: 1 },
    { id: 'documentation', agentId: 'documentation-update', maxRetries: 1 },
    { id: 'learning', agentId: 'continuous-improvement', maxRetries: 1 },
    { id: 'metrics', agentId: 'metrics', maxRetries: 1 },
    { id: 'production-health', agentId: 'production-health', maxRetries: 1 },
  ],
};

export const ALL_WORKFLOWS: WorkflowDefinition[] = [
  REFINEMENT_WORKFLOW,
  DEVELOPMENT_WORKFLOW,
  TESTING_WORKFLOW,
  RELEASE_WORKFLOW,
  DEPLOY_LEARN_WORKFLOW,
];

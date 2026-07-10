import type { AgentDefinition, AgentPhase, Role } from '@qe-ai/contracts';

/**
 * The QE.ai agent catalog. Every agent on the platform is declared here;
 * the registry wires each definition to an implementation (deep domain
 * implementations for refinement, heuristic engine + LLM enrichment for the rest).
 */

function def(
  id: string,
  name: string,
  phase: AgentPhase,
  description: string,
  opts: Partial<Pick<AgentDefinition, 'inputs' | 'outputs' | 'gatekeeper' | 'approverRoles' | 'tags' | 'execution'>> = {},
): AgentDefinition {
  return {
    id,
    name,
    phase,
    description,
    inputs: opts.inputs ?? ['story'],
    outputs: opts.outputs ?? ['assessment'],
    promptId: `prompt-${id}`,
    gatekeeper: opts.gatekeeper ?? false,
    // Judgement/analysis agents are AI-assisted by default; pure plumbing
    // and execution agents opt into DETERMINISTIC (no LLM call at all).
    execution: opts.execution ?? 'AI_ASSISTED',
    approverRoles: opts.approverRoles ?? defaultApprovers(phase),
    tags: opts.tags ?? [],
  };
}

function defaultApprovers(phase: AgentPhase): Role[] {
  switch (phase) {
    case 'REFINEMENT':
      return ['PRODUCT_OWNER', 'BUSINESS_ANALYST'];
    case 'DEVELOPMENT':
      return ['DEVELOPER', 'ARCHITECT'];
    case 'TESTING':
      return ['QA_ENGINEER', 'QE_LEAD'];
    case 'RELEASE':
      return ['RELEASE_MANAGER'];
    case 'DEPLOY_LEARN':
      return ['RELEASE_MANAGER', 'ENGINEERING_MANAGER'];
    default:
      return ['ADMIN'];
  }
}

export const REFINEMENT_AGENTS: AgentDefinition[] = [
  def('story-analysis', 'Story Analysis Agent', 'REFINEMENT', 'Analyses every story: business summary, value, risks, DoR score, testability and automation potential.', {
    outputs: ['storyAnalysis'],
  }),
  def('salesforce-impact', 'Salesforce Impact Analysis Agent', 'REFINEMENT', 'Assesses impact across Salesforce clouds, Apex, Flows, LWC, OmniStudio, CPQ, MuleSoft, metadata dependencies and regression scope.', {
    outputs: ['impactAnalysis'],
  }),
  def('three-amigos', 'Three Amigos Agent', 'REFINEMENT', 'AI-led Three Amigos workshop (PO, BA, Developer, QA): INVEST, SMART, DoR, edge cases, NFRs, actions per role.', {
    inputs: ['story', 'storyAnalysis', 'impactAnalysis'],
    outputs: ['workshopOutcome'],
  }),
  def('fca-regulatory', 'FCA Regulatory Agent', 'REFINEMENT', 'Evaluates stories against FCA regulations: operational resilience, financial promotions, consumer protection, governance, evidence.', {
    outputs: ['fcaAssessment'],
    approverRoles: ['COMPLIANCE_OFFICER'],
    tags: ['compliance'],
  }),
  def('consumer-duty', 'Consumer Duty Agent', 'REFINEMENT', 'Evaluates consumer outcomes, price & value, understanding, support, vulnerable customers and fair journeys.', {
    outputs: ['consumerDutyAssessment'],
    approverRoles: ['COMPLIANCE_OFFICER'],
    tags: ['compliance'],
  }),
  def('bdd-designer', 'BDD Test Designer Agent', 'REFINEMENT', 'Generates tagged Gherkin scenarios: happy path, negative, boundary, integration, security, accessibility, performance, API, UI, E2E.', {
    inputs: ['story', 'storyAnalysis'],
    outputs: ['scenarios'],
  }),
  def('automation-recommendation', 'Automation Recommendation Agent', 'REFINEMENT', 'Recommends automation ROI, priority, framework, complexity and maintenance cost per scenario.', {
    inputs: ['scenarios'],
    outputs: ['automationPlan'],
  }),
  def('refinement-gatekeeper', 'Refinement Gatekeeper', 'REFINEMENT', 'Blocks stories until INVEST, DoR, BDD, risk, compliance and automation reviews pass above the confidence threshold.', {
    inputs: ['storyAnalysis', 'workshopOutcome', 'fcaAssessment', 'consumerDutyAssessment', 'scenarios', 'automationPlan'],
    outputs: ['gateResult'],
    gatekeeper: true,
  }),
];

export const DEVELOPMENT_AGENTS: AgentDefinition[] = [
  def('apex-code-generator', 'Apex Code Generator', 'DEVELOPMENT', 'Generates Apex classes/triggers honouring bulkification, separation of concerns and org standards.'),
  def('lwc-generator', 'LWC Generator', 'DEVELOPMENT', 'Generates Lightning Web Components with SLDS, accessibility and wire-service best practices.'),
  def('flow-generator', 'Flow Generator', 'DEVELOPMENT', 'Designs record-triggered and screen Flows with fault paths and entry-criteria optimisation.'),
  def('soql-optimizer', 'SOQL Optimizer', 'DEVELOPMENT', 'Detects non-selective queries, N+1 patterns and missing indexes; proposes optimised SOQL.'),
  def('governor-limit-analyzer', 'Governor Limit Analyzer', 'DEVELOPMENT', 'Predicts CPU, heap, SOQL and DML limit consumption; flags limit-risk paths.'),
  def('architecture-validator', 'Architecture Validator', 'DEVELOPMENT', 'Validates changes against architecture standards, layering and integration patterns.', { approverRoles: ['ARCHITECT'] }),
  def('secure-coding', 'Secure Coding Agent', 'DEVELOPMENT', 'Checks CRUD/FLS, SOQL injection, sharing enforcement and secret handling.', { approverRoles: ['SECURITY_LEAD'], tags: ['security'] }),
  def('code-review', 'Code Review Agent', 'DEVELOPMENT', 'Reviews diffs for correctness, readability, error handling and test coverage.'),
  def('static-code-analysis', 'Static Code Analysis Agent', 'DEVELOPMENT', 'Runs static analysis rulesets and aggregates violations by severity.'),
  def('pmd-review', 'PMD Review Agent', 'DEVELOPMENT', 'Applies PMD Apex rulesets and summarises actionable violations.'),
  def('technical-debt-detector', 'Technical Debt Detector', 'DEVELOPMENT', 'Quantifies debt: duplication, complexity hotspots, deprecated API usage.'),
  def('performance-optimizer', 'Performance Optimizer', 'DEVELOPMENT', 'Identifies slow paths, cache opportunities and async offloading candidates.'),
  def('apex-unit-test-generator', 'Apex Unit Test Generator', 'DEVELOPMENT', 'Generates unit tests targeting >85% coverage with meaningful asserts.'),
  def('test-data-factory-generator', 'Test Data Factory Generator', 'DEVELOPMENT', 'Generates reusable test data factories respecting validation rules.'),
  def('mock-data-generator', 'Mock Data Generator', 'DEVELOPMENT', 'Produces mocks/stubs for callouts and external integrations.'),
  def('pull-request-reviewer', 'Pull Request Reviewer', 'DEVELOPMENT', 'Reviews PRs end-to-end: description, linked story, tests, risk annotations.'),
  def('documentation-generator', 'Documentation Generator', 'DEVELOPMENT', 'Generates technical documentation from code and design context.'),
  def('development-gatekeeper', 'Development Gatekeeper', 'DEVELOPMENT', 'Validates code coverage, mutation score, complexity, security, performance and standards before testing.', {
    gatekeeper: true,
    outputs: ['gateResult'],
  }),
];

export const TESTING_AGENTS: AgentDefinition[] = [
  def('risk-based-testing', 'Risk Based Testing Agent', 'TESTING', 'Prioritises test effort by business impact, change risk and defect history.'),
  def('regression-optimizer', 'Regression Optimizer', 'TESTING', 'Minimises regression suites while preserving coverage of impacted areas.'),
  def('regression-selection', 'Regression Selection Agent', 'TESTING', 'Selects regression cases from impact analysis and change surface.'),
  def('api-testing', 'API Testing Agent', 'TESTING', 'Designs and executes API tests: contracts, authentication, error paths.'),
  def('ui-testing', 'UI Testing Agent', 'TESTING', 'Designs and executes UI journeys across LWC and Experience Cloud pages.'),
  def('accessibility-testing', 'Accessibility Testing Agent', 'TESTING', 'Checks WCAG 2.2 AA: contrast, keyboard, ARIA, focus management.'),
  def('performance-testing', 'Performance Testing Agent', 'TESTING', 'Plans and evaluates load, stress and soak tests against SLOs.'),
  def('security-testing', 'Security Testing Agent', 'TESTING', 'Runs DAST-style checks: authz bypass, injection, session handling.', { approverRoles: ['SECURITY_LEAD'], tags: ['security'] }),
  def('compliance-testing', 'Compliance Testing Agent', 'TESTING', 'Verifies FCA/Consumer Duty evidence exists for regulated journeys.', { approverRoles: ['COMPLIANCE_OFFICER'], tags: ['compliance'] }),
  def('salesforce-integration-testing', 'Salesforce Integration Testing Agent', 'TESTING', 'Tests MuleSoft and external API integrations end-to-end.'),
  def('test-data-management', 'Test Data Management Agent', 'TESTING', 'Provisions, masks and refreshes environment test data.', { execution: 'DETERMINISTIC' }),
  def('synthetic-data-generator', 'Synthetic Data Generator', 'TESTING', 'Generates GDPR-safe synthetic datasets matching production shape.'),
  def('environment-readiness', 'Environment Readiness Agent', 'TESTING', 'Validates sandbox metadata parity, integrations and data readiness.', { execution: 'DETERMINISTIC' }),
  def('automation-execution', 'Automation Execution Agent', 'TESTING', 'Orchestrates automation suite execution and collects results.', { execution: 'DETERMINISTIC' }),
  def('coverage-analyzer', 'Coverage Analyzer', 'TESTING', 'Maps executed tests to acceptance criteria and risk areas; finds gaps.'),
  def('defect-triage', 'Defect Triage Agent', 'TESTING', 'Classifies defects by severity, component and likely owner.'),
  def('duplicate-defect-detector', 'Duplicate Defect Detector', 'TESTING', 'Detects duplicate/similar defects using semantic matching.'),
  def('root-cause-analysis', 'Root Cause Analysis Agent', 'TESTING', 'Performs RCA linking failures to changes, data and environment causes.'),
  def('automation-maintenance', 'Automation Maintenance Agent', 'TESTING', 'Detects flaky/broken automation and proposes self-healing fixes.'),
  def('testing-gatekeeper', 'Testing Gatekeeper', 'TESTING', 'Blocks release readiness until execution, coverage, defect and compliance thresholds pass.', {
    gatekeeper: true,
    outputs: ['gateResult'],
  }),
];

export const RELEASE_AGENTS: AgentDefinition[] = [
  def('release-readiness', 'Release Readiness Agent', 'RELEASE', 'Aggregates quality signals into a go/no-go readiness assessment.'),
  def('business-readiness', 'Business Readiness Agent', 'RELEASE', 'Verifies training, comms, support and operational readiness.'),
  def('release-risk-assessment', 'Release Risk Assessment Agent', 'RELEASE', 'Scores release risk from change size, defect trends and dependency exposure.'),
  def('known-issues', 'Known Issues Agent', 'RELEASE', 'Compiles known issues with impact and workarounds.'),
  def('release-defect-triage', 'Release Defect Triage Agent', 'RELEASE', 'Confirms open defects are accepted, deferred or blocking.'),
  def('release-notes-generator', 'Release Notes Generator', 'RELEASE', 'Generates technical release notes from stories, PRs and defects.'),
  def('business-communication-generator', 'Business Communication Generator', 'RELEASE', 'Drafts stakeholder-facing release communications.'),
  def('deployment-approval', 'Deployment Approval Agent', 'RELEASE', 'Prepares the deployment approval package for human sign-off.'),
  def('rollback-readiness', 'Rollback Readiness Agent', 'RELEASE', 'Validates rollback plans, destructive-change reversibility and data backout.'),
  def('release-gatekeeper', 'Release Gatekeeper', 'RELEASE', 'Blocks deployment until readiness, risk, rollback and approvals pass.', {
    gatekeeper: true,
    outputs: ['gateResult'],
  }),
];

export const DEPLOY_LEARN_AGENTS: AgentDefinition[] = [
  def('deployment', 'Deployment Agent', 'DEPLOY_LEARN', 'Executes deployment plans across environments with validation steps.', { execution: 'DETERMINISTIC' }),
  def('cicd', 'CI/CD Agent', 'DEPLOY_LEARN', 'Manages pipeline execution, quality gates and artifact promotion.', { execution: 'DETERMINISTIC' }),
  def('production-validation', 'Production Validation Agent', 'DEPLOY_LEARN', 'Runs post-deploy smoke validation of critical journeys.'),
  def('monitoring', 'Monitoring Agent', 'DEPLOY_LEARN', 'Watches KPIs, error rates and limit consumption post-release.'),
  def('observability', 'Observability Agent', 'DEPLOY_LEARN', 'Correlates traces, logs and events across Salesforce and integrations.'),
  def('incident-detection', 'Incident Detection Agent', 'DEPLOY_LEARN', 'Detects anomalies and raises incidents with context.'),
  def('root-cause-prediction', 'Root Cause Prediction Agent', 'DEPLOY_LEARN', 'Predicts likely root causes of incidents from change and telemetry history.'),
  def('documentation-update', 'Documentation Update Agent', 'DEPLOY_LEARN', 'Keeps runbooks and docs current after each release.'),
  def('knowledge-learning', 'Knowledge Learning Agent', 'DEPLOY_LEARN', 'Feeds outcomes, incidents and decisions back into the knowledge platform.'),
  def('continuous-improvement', 'Continuous Improvement Agent', 'DEPLOY_LEARN', 'Mines retrospective signals and proposes process improvements.'),
  def('production-health', 'Production Health Agent', 'DEPLOY_LEARN', 'Maintains the rolling production stability score.'),
];

export const GLOBAL_AGENTS: AgentDefinition[] = [
  def('agent-health-monitor', 'Agent Health Monitor', 'GLOBAL', 'Monitors latency, failure rates, drift and cost of every agent.', { execution: 'DETERMINISTIC' }),
  def('memory-manager', 'Memory Manager', 'GLOBAL', 'Curates working and long-term memory: retention, summarisation, eviction.', { execution: 'DETERMINISTIC' }),
  def('knowledge-manager', 'Knowledge Manager', 'GLOBAL', 'Owns knowledge ingestion, versioning and quality.'),
  def('prompt-manager', 'Prompt Manager', 'GLOBAL', 'Owns the prompt library, evaluations and rollout of prompt changes.'),
  def('prompt-versioning', 'Prompt Versioning Agent', 'GLOBAL', 'Tracks prompt versions and links every decision to the version used.', { execution: 'DETERMINISTIC' }),
  def('hallucination-detector', 'Hallucination Detector', 'GLOBAL', 'Cross-checks agent claims against evidence and knowledge sources.'),
  def('cost-optimizer', 'Cost Optimizer', 'GLOBAL', 'Optimises model selection and token spend per workload.'),
  def('llm-performance-analyzer', 'LLM Performance Analyzer', 'GLOBAL', 'Tracks model quality, latency and drift across workloads.'),
  def('governance-manager', 'Governance Manager', 'GLOBAL', 'Enforces the governance envelope and explainability requirements.'),
  def('audit-manager', 'Audit Manager', 'GLOBAL', 'Guards the immutable audit trail and compliance exports.', { execution: 'DETERMINISTIC' }),
  def('notification-manager', 'Notification Manager', 'GLOBAL', 'Routes notifications to Slack/Teams/email per subscription rules.', { execution: 'DETERMINISTIC' }),
  def('security-governance', 'Security Governance Agent', 'GLOBAL', 'Monitors platform security posture, secrets and access reviews.', { approverRoles: ['SECURITY_LEAD'] }),
  def('human-approval', 'Human Approval Agent', 'GLOBAL', 'Manages approval queues, routing, SLAs and escalation.'),
  def('metrics', 'Metrics Agent', 'GLOBAL', 'Computes quality metrics powering all dashboards.', { execution: 'DETERMINISTIC' }),
];

export const PREDICTION_AGENTS: AgentDefinition[] = [
  def('sprint-success-prediction', 'Sprint Success Prediction Agent', 'GLOBAL', 'Predicts sprint goal attainment from velocity, scope and risk signals.', { tags: ['prediction'] }),
  def('release-failure-prediction', 'Release Failure Prediction Agent', 'GLOBAL', 'Predicts release failure probability from change and defect signals.', { tags: ['prediction'] }),
  def('defect-leakage-prediction', 'Defect Leakage Prediction Agent', 'GLOBAL', 'Predicts production defect leakage from coverage and escape history.', { tags: ['prediction'] }),
  def('automation-roi-prediction', 'Automation ROI Prediction Agent', 'GLOBAL', 'Predicts ROI of automation investments.', { tags: ['prediction'] }),
  def('technical-debt-prediction', 'Technical Debt Prediction Agent', 'GLOBAL', 'Predicts debt accumulation trajectory.', { tags: ['prediction'] }),
  def('compliance-risk-prediction', 'Compliance Risk Prediction Agent', 'GLOBAL', 'Predicts compliance risk exposure per release.', { tags: ['prediction'] }),
  def('production-incident-prediction', 'Production Incident Prediction Agent', 'GLOBAL', 'Predicts incident likelihood post-deployment.', { tags: ['prediction'] }),
  def('quality-maturity-prediction', 'Quality Maturity Prediction Agent', 'GLOBAL', 'Predicts quality maturity trajectory across squads.', { tags: ['prediction'] }),
];

export const ALL_AGENT_DEFINITIONS: AgentDefinition[] = [
  ...REFINEMENT_AGENTS,
  ...DEVELOPMENT_AGENTS,
  ...TESTING_AGENTS,
  ...RELEASE_AGENTS,
  ...DEPLOY_LEARN_AGENTS,
  ...GLOBAL_AGENTS,
  ...PREDICTION_AGENTS,
];

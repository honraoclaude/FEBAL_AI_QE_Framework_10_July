import { describe, expect, it } from 'vitest';
import {
  AgentRegistry,
  ApprovalService,
  AuditTrail,
  EventBus,
  MemoryStore,
  PromptLibrary,
  SimulatedLlmProvider,
  WorkflowEngine,
} from '@qe-ai/agent-kernel';
import { bootstrapAgentPlatform, ALL_AGENT_DEFINITIONS, type BddPack, type RefinementGateResult, type StoryInput } from '../src/index.js';

const TENANT = 'tenant-test';

function buildPlatform() {
  const bus = new EventBus();
  const audit = new AuditTrail();
  const approvals = new ApprovalService(bus, audit);
  const memory = new MemoryStore();
  const registry = new AgentRegistry();
  const prompts = new PromptLibrary();
  const engine = new WorkflowEngine(registry, bus, audit, approvals, memory, prompts, new SimulatedLlmProvider(), {
    gateConfidenceThreshold: 0.7,
  });
  bootstrapAgentPlatform(registry, engine, prompts);
  return { engine, approvals, registry, audit };
}

const READY_STORY: StoryInput = {
  id: 'ST-100',
  jiraKey: 'FSC-100',
  title: 'Customer portal fee disclosure screen',
  description:
    'As a customer using the self-service portal, I want to see a clear breakdown of all account fees and charges before confirming a product switch, so that I can make an informed decision. The screen must render fee data from the pricing API and record customer confirmation for audit purposes.',
  storyPoints: 5,
  labels: ['portal', 'pricing'],
  acceptanceCriteria: [
    { id: 'ac1', text: 'Given an authenticated customer, when the fee screen loads, then all applicable fees are displayed with plain-language descriptions', testable: true },
    { id: 'ac2', text: 'Given fee data cannot be retrieved, when the screen loads, then a retriable error is shown and the journey is blocked', testable: true },
    { id: 'ac3', text: 'Given a customer confirms the switch, when confirmation is submitted, then the confirmation is stored with a timestamp', testable: true },
  ],
};

describe('QE.ai agent platform', () => {
  it('registers the complete agent catalog', () => {
    const { registry } = buildPlatform();
    expect(registry.list().length).toBe(ALL_AGENT_DEFINITIONS.length);
    expect(registry.list().length).toBeGreaterThanOrEqual(85);
    // Every phase is represented.
    for (const phase of ['REFINEMENT', 'DEVELOPMENT', 'TESTING', 'RELEASE', 'DEPLOY_LEARN', 'GLOBAL'] as const) {
      expect(registry.list(phase).length).toBeGreaterThan(0);
    }
  });

  it('runs the full refinement workflow for a ready story and pauses for human approval at the gate', async () => {
    const { engine, approvals } = buildPlatform();
    const run = await engine.start({
      tenantId: TENANT,
      definitionId: 'refinement',
      subjectType: 'STORY',
      subjectId: READY_STORY.id,
      triggeredBy: 'po@qe.ai',
      initialContext: { story: READY_STORY },
    });

    // Gatekeeper always requires human approval per workflow config.
    expect(run.status).toBe('AWAITING_APPROVAL');

    const gateStep = run.steps.find((s) => s.agentId === 'refinement-gatekeeper')!;
    const gateDecision = engine.getDecision(gateStep.decisionId!)!;
    const gateResult = gateDecision.payload as RefinementGateResult;
    expect(gateResult.passed).toBe(true);
    expect(gateResult.checks.every((c) => c.pass)).toBe(true);

    // BDD pack was generated with tagged scenarios covering all categories.
    const bddStep = run.steps.find((s) => s.agentId === 'bdd-designer')!;
    const bdd = engine.getDecision(bddStep.decisionId!)!.payload as BddPack;
    expect(bdd.scenarios.length).toBe(READY_STORY.acceptanceCriteria.length * 3 + 8);
    expect(bdd.scenarios.some((s) => s.tags.includes('@Security'))).toBe(true);
    expect(bdd.scenarios.some((s) => s.tags.includes('@ConsumerDuty'))).toBe(true);

    // Human approves -> workflow completes.
    const pending = approvals.list(TENANT, 'REVIEW');
    expect(pending).toHaveLength(1);
    await approvals.resolve({
      approvalId: pending[0]!.id,
      status: 'APPROVED',
      resolvedBy: 'po@qe.ai',
      resolverRoles: ['PRODUCT_OWNER'],
    });
    expect(run.status).toBe('COMPLETED');
  });

  it('fails the gate for an unrefined story', async () => {
    const { engine } = buildPlatform();
    const emptyStory: StoryInput = {
      id: 'ST-200',
      jiraKey: 'FSC-200',
      title: 'Do the thing',
      description: 'TBD',
      labels: [],
      acceptanceCriteria: [],
    };
    const run = await engine.start({
      tenantId: TENANT,
      definitionId: 'refinement',
      subjectType: 'STORY',
      subjectId: emptyStory.id,
      triggeredBy: 'po@qe.ai',
      initialContext: { story: emptyStory },
    });

    expect(run.status).toBe('AWAITING_APPROVAL');
    const gateStep = run.steps.find((s) => s.agentId === 'refinement-gatekeeper')!;
    const gateResult = engine.getDecision(gateStep.decisionId!)!.payload as RefinementGateResult;
    expect(gateResult.passed).toBe(false);
    expect(gateResult.checks.find((c) => c.name === 'Definition of Ready')!.pass).toBe(false);
  });

  it('records governance envelopes and an intact audit chain for every decision', async () => {
    const { engine, audit } = buildPlatform();
    const run = await engine.start({
      tenantId: TENANT,
      definitionId: 'refinement',
      subjectType: 'STORY',
      subjectId: READY_STORY.id,
      triggeredBy: 'po@qe.ai',
      initialContext: { story: READY_STORY },
    });

    for (const step of run.steps.filter((s) => s.decisionId)) {
      const decision = engine.getDecision(step.decisionId!)!;
      expect(decision.reasoning.length).toBeGreaterThan(10);
      expect(decision.evidence.length).toBeGreaterThan(0);
      expect(decision.confidence).toBeGreaterThan(0);
      expect(decision.promptVersion).toBe('1.0');
      expect(decision.knowledgeVersion).toMatch(/^kb-v/);
    }
    expect(audit.verifyChain(TENANT)).toBeNull();
    expect(audit.query(TENANT, { kind: 'AGENT_DECISION' }).length).toBeGreaterThanOrEqual(7);
  });

  it('runs all five phase workflows end to end', async () => {
    const { engine, approvals } = buildPlatform();
    for (const definitionId of ['development', 'testing', 'release', 'deploy-learn']) {
      const run = await engine.start({
        tenantId: TENANT,
        definitionId,
        subjectType: definitionId === 'deploy-learn' ? 'DEPLOYMENT' : 'STORY',
        subjectId: `SUBJ-${definitionId}`,
        triggeredBy: 'tester',
        initialContext: { story: READY_STORY },
      });
      if (run.status === 'AWAITING_APPROVAL') {
        const pending = approvals.list(TENANT, 'REVIEW');
        await approvals.resolve({
          approvalId: pending[pending.length - 1]!.id,
          status: 'APPROVED',
          resolvedBy: 'admin@qe.ai',
          resolverRoles: ['ADMIN'],
        });
      }
      expect(['COMPLETED', 'AWAITING_APPROVAL']).toContain(run.status);
    }
  });
});

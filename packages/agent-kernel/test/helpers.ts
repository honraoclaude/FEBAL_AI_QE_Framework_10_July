import type { AgentDefinition } from '@qe-ai/contracts';
import {
  AgentRegistry,
  ApprovalService,
  AuditTrail,
  BaseAgent,
  EventBus,
  FeedbackService,
  MemoryStore,
  PromptLibrary,
  SimulatedLlmProvider,
  WorkflowEngine,
  type AgentContext,
  type AgentResult,
} from '../src/index.js';

export const TENANT = 'tenant-test';

export function definition(id: string, overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id,
    name: id,
    phase: 'REFINEMENT',
    description: `Test agent ${id}`,
    inputs: [],
    outputs: [],
    promptId: 'test-prompt',
    gatekeeper: false,
    execution: 'AI_ASSISTED',
    approverRoles: ['QE_LEAD'],
    tags: [],
    ...overrides,
  };
}

export class StubAgent extends BaseAgent<Record<string, unknown>> {
  executions = 0;

  constructor(
    def: AgentDefinition,
    private readonly behavior: (ctx: AgentContext, execution: number) => AgentResult<Record<string, unknown>>,
  ) {
    super(def);
  }

  protected async analyze(ctx: AgentContext): Promise<AgentResult<Record<string, unknown>>> {
    this.executions += 1;
    return this.behavior(ctx, this.executions);
  }
}

export function okResult(payload: Record<string, unknown> = {}, confidence = 0.95): AgentResult<Record<string, unknown>> {
  return {
    reasoning: 'test reasoning',
    evidence: ['test evidence'],
    confidence,
    risk: 'LOW',
    businessImpact: 'none',
    technicalImpact: 'none',
    complianceImpact: 'none',
    recommendedAction: 'proceed',
    alternativeRecommendations: [],
    payload,
  };
}

export function buildKernel() {
  const bus = new EventBus();
  const audit = new AuditTrail();
  const approvals = new ApprovalService(bus, audit);
  const memory = new MemoryStore();
  const registry = new AgentRegistry();
  const prompts = new PromptLibrary();
  prompts.register({
    id: 'test-prompt',
    version: '1.0',
    description: 'test',
    system: 'You are a test agent.',
    template: 'Subject {{subjectId}} input {{input}} heuristics {{heuristics}} knowledge {{knowledge}}',
  });
  const feedback = new FeedbackService(audit, memory);
  const engine = new WorkflowEngine(registry, bus, audit, approvals, memory, prompts, new SimulatedLlmProvider(), {
    gateConfidenceThreshold: 0.7,
  });
  return { bus, audit, approvals, memory, registry, prompts, engine, feedback };
}

import {
  AgentRegistry,
  ApprovalService,
  AuditTrail,
  EventBus,
  FeedbackService,
  MemoryStore,
  PromptLibrary,
  WorkflowEngine,
  createLlmProvider,
} from '@qe-ai/agent-kernel';
import { bootstrapAgentPlatform } from '@qe-ai/agents';
import { JiraSyncService, MockJiraAdapter } from './jira.js';
import { MetricsService } from './metrics.js';
import {
  DEMO_TENANT_ID,
  REMOTE_JIRA_ISSUES,
  seedKnowledge,
  seedSprints,
  seedTenant,
  seedTestExecutions,
  seedUsers,
} from './seed.js';
import { SprintStore, TenantStore, TestExecutionStore, UserStore, WorkItemStore } from './stores.js';

/**
 * Composition root. Wires the kernel, agent catalog, adapters and stores into
 * a per-process platform instance. In production this is one instance per
 * service, with stores backed by PostgreSQL and the bus by Kafka/NATS.
 */
export interface Platform {
  tenantId: string;
  bus: EventBus;
  audit: AuditTrail;
  approvals: ApprovalService;
  memory: MemoryStore;
  registry: AgentRegistry;
  prompts: PromptLibrary;
  engine: WorkflowEngine;
  feedback: FeedbackService;
  workItems: WorkItemStore;
  sprints: SprintStore;
  tenants: TenantStore;
  users: UserStore;
  executions: TestExecutionStore;
  jira: JiraSyncService;
  jiraAdapter: MockJiraAdapter;
  metrics: MetricsService;
}

export async function createPlatform(options: { seed?: boolean; stepDelayMs?: number } = {}): Promise<Platform> {
  const bus = new EventBus();
  const audit = new AuditTrail();
  const approvals = new ApprovalService(bus, audit);
  const memory = new MemoryStore();
  const registry = new AgentRegistry();
  const prompts = new PromptLibrary();
  const feedback = new FeedbackService(audit, memory);

  const tenants = new TenantStore();
  const users = new UserStore();
  const sprints = new SprintStore();
  const workItems = new WorkItemStore();
  const executions = new TestExecutionStore();

  const tenant = seedTenant(tenants);
  const llm = createLlmProvider(tenant.settings.llmProvider, tenant.settings.llmModel);
  const engine = new WorkflowEngine(registry, bus, audit, approvals, memory, prompts, llm, {
    gateConfidenceThreshold: tenant.settings.gateConfidenceThreshold,
    stepDelayMs: options.stepDelayMs ?? 0,
  });
  bootstrapAgentPlatform(registry, engine, prompts);

  // Lifecycle stage progression, event-driven so it applies to synchronous
  // and detached runs alike. Stages only move FORWARD (re-running an earlier
  // phase never regresses a story); ad-hoc workflows (reevaluate-*,
  // branch-review) are not in the maps and therefore never touch stages.
  const STAGE_ORDER: WorkItemStoreStage[] = [
    'BACKLOG',
    'REFINEMENT',
    'DEVELOPMENT_READY',
    'DEVELOPMENT',
    'TESTING_READY',
    'TESTING',
    'RELEASE_READY',
    'RELEASE',
    'DEPLOYED',
    'LEARNING',
  ];
  const STAGE_ON_STARTED: Record<string, WorkItemStoreStage> = {
    refinement: 'REFINEMENT',
    development: 'DEVELOPMENT',
    testing: 'TESTING',
    release: 'RELEASE',
  };
  const STAGE_ON_COMPLETED: Record<string, WorkItemStoreStage> = {
    refinement: 'DEVELOPMENT_READY',
    development: 'TESTING_READY',
    testing: 'RELEASE_READY',
    release: 'RELEASE',
    'deploy-learn': 'DEPLOYED',
  };
  const advanceStage = (subjectId: string, next: WorkItemStoreStage | undefined) => {
    if (!next) return;
    const item = workItems.get(subjectId);
    if (!item) return;
    if (STAGE_ORDER.indexOf(next) > STAGE_ORDER.indexOf(item.stage)) {
      item.stage = next;
      workItems.upsert(item);
    }
  };
  bus.subscribe('workflow.started', async (event) => {
    const { runId } = event.payload as { runId: string };
    const run = engine.getRun(runId);
    if (run) advanceStage(run.subjectId, STAGE_ON_STARTED[run.definitionId]);
  });
  bus.subscribe('workflow.completed', async (event) => {
    const { runId } = event.payload as { runId: string };
    const run = engine.getRun(runId);
    if (run) advanceStage(run.subjectId, STAGE_ON_COMPLETED[run.definitionId]);
  });

  const jiraAdapter = new MockJiraAdapter(REMOTE_JIRA_ISSUES);
  const jira = new JiraSyncService(DEMO_TENANT_ID, jiraAdapter, workItems, sprints, audit, bus);
  const metrics = new MetricsService(DEMO_TENANT_ID, workItems, sprints, executions, registry, approvals, engine, feedback);

  if (options.seed !== false) {
    seedUsers(users);
    seedSprints(sprints);
    seedKnowledge(memory);
    seedTestExecutions(executions);
    await jira.sync('AUTO', 'system-bootstrap');
    // Reflect JIRA statuses into lifecycle stages for the demo dataset.
    const stageByStatus: Record<string, WorkItemStoreStage> = {
      'In Refinement': 'REFINEMENT',
      'In Development': 'DEVELOPMENT',
      'In Testing': 'TESTING',
      'Release Ready': 'RELEASE_READY',
      Backlog: 'BACKLOG',
    };
    for (const item of workItems.list(DEMO_TENANT_ID)) {
      item.stage = stageByStatus[item.status] ?? 'BACKLOG';
      workItems.upsert(item);
    }
  }

  return {
    tenantId: DEMO_TENANT_ID,
    bus,
    audit,
    approvals,
    memory,
    registry,
    prompts,
    engine,
    feedback,
    workItems,
    sprints,
    tenants,
    users,
    executions,
    jira,
    jiraAdapter,
    metrics,
  };
}

type WorkItemStoreStage = import('@qe-ai/contracts').StoryLifecycleStage;

import type {
  AgentDecision,
  StepRun,
  WorkflowDefinition,
  WorkflowRun,
} from '@qe-ai/contracts';
import { gatePassed, type AgentContext } from './agent.js';
import type { ApprovalService } from './approvals.js';
import type { AuditTrail } from './audit.js';
import type { EventBus } from './eventBus.js';
import type { LlmProvider } from './llm.js';
import type { MemoryStore } from './memory.js';
import type { PromptLibrary } from './prompts.js';
import type { AgentRegistry } from './registry.js';
import { newId, nowIso } from './util.js';

export interface WorkflowEngineOptions {
  /** Gate confidence threshold (0..1). Gatekeeper decisions below it escalate to a human. */
  gateConfidenceThreshold?: number;
  /**
   * Optional pacing delay before each step (ms). Used in demo mode so live
   * observers can watch steps progress; keep 0 in tests and with real LLM
   * providers (which have natural latency).
   */
  stepDelayMs?: number;
}

export interface StartWorkflowInput {
  tenantId: string;
  definitionId: string;
  subjectType: WorkflowRun['subjectType'];
  subjectId: string;
  triggeredBy: string;
  initialContext?: Record<string, unknown>;
  /**
   * When true, `start` returns as soon as the run is created and execution
   * continues asynchronously — observe progress via `workflow.*` events or
   * by polling the run. When false (default), `start` resolves once the run
   * completes, fails or pauses for approval.
   */
  detached?: boolean;
}

/**
 * AI Workflow Orchestrator.
 * Executes configurable multi-agent workflows: sequential + parallel steps,
 * retries, pause/resume, rollback, human-approval gates, context passing,
 * state and memory management, full audit and event emission.
 */
export class WorkflowEngine {
  private definitions = new Map<string, WorkflowDefinition>();
  private runs = new Map<string, WorkflowRun>();
  private decisions = new Map<string, AgentDecision>();
  private approvalToRun = new Map<string, string>();

  constructor(
    private readonly registry: AgentRegistry,
    private readonly bus: EventBus,
    private readonly audit: AuditTrail,
    private readonly approvals: ApprovalService,
    private readonly memory: MemoryStore,
    private readonly prompts: PromptLibrary,
    private readonly llm: LlmProvider,
    private readonly options: WorkflowEngineOptions = {},
  ) {
    // Resuming approved workflows is event-driven, mirroring a production event bus wiring.
    this.bus.subscribe('approval.resolved', async (event) => {
      const { approvalId, status } = event.payload as { approvalId: string; status: string };
      const runId = this.approvalToRun.get(approvalId);
      if (!runId) return;
      if (status === 'APPROVED') {
        await this.resumeAfterApproval(runId, true);
      } else if (status === 'REJECTED') {
        await this.resumeAfterApproval(runId, false);
      }
    });
  }

  define(definition: WorkflowDefinition): void {
    for (const step of definition.steps) {
      if (!this.registry.has(step.agentId)) {
        throw new Error(`Workflow ${definition.id} references unknown agent ${step.agentId}`);
      }
    }
    this.definitions.set(definition.id, definition);
  }

  listDefinitions(): WorkflowDefinition[] {
    return [...this.definitions.values()];
  }

  getDefinition(id: string): WorkflowDefinition | undefined {
    return this.definitions.get(id);
  }

  getRun(runId: string): WorkflowRun | undefined {
    return this.runs.get(runId);
  }

  listRuns(tenantId: string): WorkflowRun[] {
    return [...this.runs.values()].filter((r) => r.tenantId === tenantId);
  }

  getDecision(decisionId: string): AgentDecision | undefined {
    return this.decisions.get(decisionId);
  }

  listDecisions(tenantId: string, subjectId?: string): AgentDecision[] {
    let all = [...this.decisions.values()].filter((d) => d.tenantId === tenantId);
    if (subjectId) all = all.filter((d) => d.subjectId === subjectId);
    return all;
  }

  /**
   * A pending human approval freezes the subject: no further agents may run
   * for it — in this workflow or any other phase — until the approval is
   * resolved. Returns the blocking run, if any.
   */
  approvalBlock(tenantId: string, subjectId: string): WorkflowRun | undefined {
    return [...this.runs.values()].find(
      (run) => run.tenantId === tenantId && run.subjectId === subjectId && run.status === 'AWAITING_APPROVAL',
    );
  }

  async start(input: StartWorkflowInput): Promise<WorkflowRun> {
    const definition = this.definitions.get(input.definitionId);
    if (!definition) throw new Error(`Unknown workflow: ${input.definitionId}`);

    const blocking = this.approvalBlock(input.tenantId, input.subjectId);
    if (blocking) {
      const blockingDefinition = this.definitions.get(blocking.definitionId);
      const waitingStep = blocking.steps.find((s) => s.status === 'AWAITING_APPROVAL');
      throw new Error(
        `Cannot start ${definition.name}: ${blockingDefinition?.name ?? blocking.definitionId} is awaiting human approval` +
          `${waitingStep ? ` at ${waitingStep.agentId}` : ''} for this work item. ` +
          'Resolve the pending approval before running further agents.',
      );
    }

    const run: WorkflowRun = {
      id: newId('run'),
      tenantId: input.tenantId,
      definitionId: definition.id,
      definitionVersion: definition.version,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      status: 'RUNNING',
      steps: definition.steps.map((s) => ({
        stepId: s.id,
        agentId: s.agentId,
        status: 'PENDING',
        attempts: 0,
      })),
      context: { ...input.initialContext },
      startedAt: nowIso(),
      triggeredBy: input.triggeredBy,
    };
    this.runs.set(run.id, run);
    this.memory.mergeWorkingMemory(run.id, run.context);

    this.audit.record({
      tenantId: run.tenantId,
      kind: 'WORKFLOW_STARTED',
      actor: input.triggeredBy,
      summary: `Workflow ${definition.name} started for ${input.subjectId}`,
      workflowRunId: run.id,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      detail: { definitionId: definition.id, version: definition.version },
    });
    await this.bus.publish(run.tenantId, 'workflow.started', { runId: run.id }, 'workflow-engine');

    if (input.detached) {
      void this.process(run).catch((error) => {
        run.status = 'FAILED';
        run.finishedAt = nowIso();
        this.audit.record({
          tenantId: run.tenantId,
          kind: 'WORKFLOW_FAILED',
          actor: 'workflow-engine',
          summary: `Detached run crashed: ${error instanceof Error ? error.message : String(error)}`,
          workflowRunId: run.id,
          subjectId: run.subjectId,
        });
      });
      return run;
    }

    await this.process(run);
    return run;
  }

  pause(runId: string, actor: string): WorkflowRun {
    const run = this.mustGetRun(runId);
    if (run.status !== 'RUNNING') throw new Error(`Cannot pause run in status ${run.status}`);
    run.status = 'PAUSED';
    this.audit.record({
      tenantId: run.tenantId,
      kind: 'WORKFLOW_STEP',
      actor,
      summary: 'Workflow paused',
      workflowRunId: run.id,
    });
    return run;
  }

  async resume(runId: string, actor: string): Promise<WorkflowRun> {
    const run = this.mustGetRun(runId);
    if (run.status !== 'PAUSED') throw new Error(`Cannot resume run in status ${run.status}`);
    run.status = 'RUNNING';
    this.audit.record({
      tenantId: run.tenantId,
      kind: 'WORKFLOW_STEP',
      actor,
      summary: 'Workflow resumed',
      workflowRunId: run.id,
    });
    await this.process(run);
    return run;
  }

  async rollback(runId: string, actor: string): Promise<WorkflowRun> {
    const run = this.mustGetRun(runId);
    run.status = 'ROLLED_BACK';
    run.finishedAt = nowIso();
    for (const step of run.steps) {
      if (step.status === 'COMPLETED') step.status = 'SKIPPED';
    }
    this.memory.clearWorkingMemory(run.id);
    this.audit.record({
      tenantId: run.tenantId,
      kind: 'WORKFLOW_ROLLED_BACK',
      actor,
      summary: `Workflow ${run.definitionId} rolled back`,
      workflowRunId: run.id,
      subjectId: run.subjectId,
    });
    await this.bus.publish(run.tenantId, 'workflow.rolled_back', { runId: run.id }, 'workflow-engine');
    return run;
  }

  cancel(runId: string, actor: string): WorkflowRun {
    const run = this.mustGetRun(runId);
    run.status = 'CANCELLED';
    run.finishedAt = nowIso();
    this.audit.record({
      tenantId: run.tenantId,
      kind: 'WORKFLOW_STEP',
      actor,
      summary: 'Workflow cancelled',
      workflowRunId: run.id,
    });
    return run;
  }

  // ---- internals ----

  private mustGetRun(runId: string): WorkflowRun {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Unknown run: ${runId}`);
    return run;
  }

  /**
   * Processes pending steps. Consecutive steps sharing a `parallelGroup`
   * execute concurrently; everything else is sequential. Stops when the run
   * pauses, awaits approval, fails, or completes.
   */
  private async process(run: WorkflowRun): Promise<void> {
    const definition = this.definitions.get(run.definitionId)!;

    while (run.status === 'RUNNING') {
      const nextIndex = run.steps.findIndex((s) => s.status === 'PENDING' || s.status === 'RETRYING');
      if (nextIndex === -1) {
        run.status = 'COMPLETED';
        run.finishedAt = nowIso();
        this.audit.record({
          tenantId: run.tenantId,
          kind: 'WORKFLOW_COMPLETED',
          actor: 'workflow-engine',
          summary: `Workflow ${definition.name} completed`,
          workflowRunId: run.id,
          subjectId: run.subjectId,
        });
        await this.bus.publish(run.tenantId, 'workflow.completed', { runId: run.id }, 'workflow-engine');
        return;
      }

      // Build the wave: the next step plus consecutive steps in the same parallel group.
      const wave: number[] = [nextIndex];
      const group = definition.steps[nextIndex]?.parallelGroup;
      if (group) {
        for (let i = nextIndex + 1; i < definition.steps.length; i++) {
          const candidate = definition.steps[i]!;
          const candidateRun = run.steps[i]!;
          if (candidate.parallelGroup === group && candidateRun.status === 'PENDING') wave.push(i);
          else break;
        }
      }

      const outcomes = await Promise.all(wave.map((index) => this.executeStep(run, index)));
      for (const outcome of outcomes) {
        if (outcome === 'halt') return;
      }
    }
  }

  private async executeStep(run: WorkflowRun, index: number): Promise<'continue' | 'halt'> {
    const definition = this.definitions.get(run.definitionId)!;
    const stepDef = definition.steps[index]!;
    const stepRun = run.steps[index]!;
    const agent = this.registry.get(stepDef.agentId);

    stepRun.status = 'RUNNING';
    stepRun.startedAt = stepRun.startedAt ?? nowIso();
    this.registry.markRunning(stepDef.agentId);
    await this.bus.publish(
      run.tenantId,
      'workflow.step.started',
      { runId: run.id, stepId: stepDef.id, agentId: stepDef.agentId },
      'workflow-engine',
    );
    if (this.options.stepDelayMs && this.options.stepDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.stepDelayMs));
    }

    const context: AgentContext = {
      tenantId: run.tenantId,
      subjectType: run.subjectType,
      subjectId: run.subjectId,
      workflowRunId: run.id,
      stepId: stepDef.id,
      input: this.memory.getWorkingMemory(run.id),
      llm: this.llm,
      prompts: this.prompts,
      memory: this.memory,
    };

    const startedAt = Date.now();
    let decision: AgentDecision | undefined;
    try {
      stepRun.attempts += 1;
      decision = await agent.execute(context);
    } catch (error) {
      this.registry.recordRun(stepDef.agentId, { latencyMs: Date.now() - startedAt, failed: true });
      const message = error instanceof Error ? error.message : String(error);
      if (stepRun.attempts <= stepDef.maxRetries) {
        stepRun.status = 'RETRYING';
        this.audit.record({
          tenantId: run.tenantId,
          kind: 'WORKFLOW_STEP',
          actor: 'workflow-engine',
          summary: `Step ${stepDef.id} failed (attempt ${stepRun.attempts}); retrying`,
          workflowRunId: run.id,
          agentId: stepDef.agentId,
          detail: { error: message },
        });
        return 'continue';
      }
      stepRun.status = 'FAILED';
      stepRun.error = message;
      stepRun.finishedAt = nowIso();
      if (stepDef.continueOnFailure) {
        stepRun.status = 'SKIPPED';
        return 'continue';
      }
      run.status = 'FAILED';
      run.finishedAt = nowIso();
      this.audit.record({
        tenantId: run.tenantId,
        kind: 'WORKFLOW_FAILED',
        actor: 'workflow-engine',
        summary: `Workflow failed at step ${stepDef.id}: ${message}`,
        workflowRunId: run.id,
        agentId: stepDef.agentId,
        subjectId: run.subjectId,
      });
      await this.bus.publish(run.tenantId, 'workflow.failed', { runId: run.id, stepId: stepDef.id }, 'workflow-engine');
      return 'halt';
    }

    // Persist decision + context for downstream steps.
    this.decisions.set(decision.id, decision);
    stepRun.decisionId = decision.id;
    this.registry.recordRun(stepDef.agentId, { latencyMs: Date.now() - startedAt, confidence: decision.confidence });
    this.memory.mergeWorkingMemory(run.id, { [stepDef.agentId]: decision.payload });
    run.context = this.memory.getWorkingMemory(run.id);

    this.audit.record({
      tenantId: run.tenantId,
      kind: 'AGENT_DECISION',
      actor: stepDef.agentId,
      summary: `${agent.definition.name}: ${decision.recommendedAction.slice(0, 160)}`,
      workflowRunId: run.id,
      agentId: stepDef.agentId,
      decisionId: decision.id,
      promptVersion: decision.promptVersion,
      llmVersion: decision.llmVersion,
      knowledgeVersion: decision.knowledgeVersion,
      subjectType: run.subjectType,
      subjectId: run.subjectId,
      detail: { confidence: decision.confidence, risk: decision.risk, evidence: decision.evidence },
    });
    await this.bus.publish(
      run.tenantId,
      'workflow.step.completed',
      { runId: run.id, stepId: stepDef.id, decisionId: decision.id },
      'workflow-engine',
    );

    // Gatekeeper enforcement: block on explicit failure or low confidence.
    const threshold = this.options.gateConfidenceThreshold ?? 0.7;
    const needsHuman =
      stepDef.humanApproval ||
      (agent.definition.gatekeeper && (!gatePassed(decision) || decision.confidence < threshold));

    if (needsHuman) {
      stepRun.status = 'AWAITING_APPROVAL';
      run.status = 'AWAITING_APPROVAL';
      const approval = await this.approvals.request({
        tenantId: run.tenantId,
        type: this.approvalTypeFor(agent.definition.phase),
        title: `${agent.definition.name} — ${run.subjectId}`,
        subjectType: run.subjectType,
        subjectId: run.subjectId,
        requestedBy: stepDef.agentId,
        decisionId: decision.id,
        workflowRunId: run.id,
      });
      this.approvalToRun.set(approval.id, run.id);
      return 'halt';
    }

    stepRun.status = 'COMPLETED';
    stepRun.finishedAt = nowIso();
    return 'continue';
  }

  private async resumeAfterApproval(runId: string, approved: boolean): Promise<void> {
    const run = this.runs.get(runId);
    if (!run || run.status !== 'AWAITING_APPROVAL') return;
    const waiting = run.steps.find((s) => s.status === 'AWAITING_APPROVAL');
    if (!waiting) return;

    if (waiting.decisionId) {
      const decision = this.decisions.get(waiting.decisionId);
      if (decision) decision.approvalStatus = approved ? 'APPROVED' : 'REJECTED';
    }

    if (approved) {
      waiting.status = 'COMPLETED';
      waiting.finishedAt = nowIso();
      run.status = 'RUNNING';
      await this.process(run);
    } else {
      waiting.status = 'FAILED';
      waiting.error = 'Rejected by human approver';
      waiting.finishedAt = nowIso();
      run.status = 'FAILED';
      run.finishedAt = nowIso();
      await this.bus.publish(run.tenantId, 'workflow.failed', { runId: run.id, stepId: waiting.stepId }, 'workflow-engine');
    }
  }

  private approvalTypeFor(phase: string): Parameters<ApprovalService['request']>[0]['type'] {
    switch (phase) {
      case 'REFINEMENT':
        return 'STORY';
      case 'DEVELOPMENT':
        return 'CODE';
      case 'TESTING':
        return 'REGRESSION';
      case 'RELEASE':
        return 'RELEASE';
      case 'DEPLOY_LEARN':
        return 'DEPLOYMENT';
      default:
        return 'STORY';
    }
  }

  /** Mermaid visualisation of a run for the UI and docs. */
  visualize(runId: string): string {
    const run = this.mustGetRun(runId);
    const definition = this.definitions.get(run.definitionId)!;
    const lines = ['flowchart TD'];
    definition.steps.forEach((step, i) => {
      const stepRun = run.steps[i]!;
      const label = `${step.agentId}\\n[${stepRun.status}]`;
      lines.push(`  ${step.id}["${label}"]`);
      if (i > 0) lines.push(`  ${definition.steps[i - 1]!.id} --> ${step.id}`);
    });
    return lines.join('\n');
  }
}

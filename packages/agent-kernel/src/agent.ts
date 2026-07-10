import type { AgentDecision, AgentDefinition, RiskLevel } from '@qe-ai/contracts';
import type { LlmProvider } from './llm.js';
import type { MemoryStore } from './memory.js';
import type { PromptLibrary } from './prompts.js';
import { clamp, newId, nowIso } from './util.js';

/** Everything an agent needs to execute one step, injected by the orchestrator. */
export interface AgentContext {
  tenantId: string;
  subjectType: AgentDecision['subjectType'];
  subjectId: string;
  workflowRunId?: string;
  stepId?: string;
  /** Accumulated workflow context (outputs of upstream agents). */
  input: Record<string, unknown>;
  llm: LlmProvider;
  prompts: PromptLibrary;
  memory: MemoryStore;
}

/** Domain result an agent implementation returns; the kernel wraps it in the governance envelope. */
export interface AgentResult<TPayload = unknown> {
  reasoning: string;
  evidence: string[];
  confidence: number;
  risk: RiskLevel;
  businessImpact: string;
  technicalImpact: string;
  complianceImpact: string;
  recommendedAction: string;
  alternativeRecommendations: string[];
  payload: TPayload;
  /** Gatekeepers set this to false to block workflow progression. */
  passed?: boolean;
}

export interface Agent<TPayload = unknown> {
  readonly definition: AgentDefinition;
  execute(context: AgentContext): Promise<AgentDecision<TPayload>>;
}

/**
 * Base agent: implementations provide `analyze` (deterministic domain logic);
 * the base class enriches reasoning with LLM narrative when a live provider is
 * configured and wraps everything in the mandatory governance envelope.
 */
export abstract class BaseAgent<TPayload = unknown> implements Agent<TPayload> {
  constructor(readonly definition: AgentDefinition) {}

  protected abstract analyze(context: AgentContext): Promise<AgentResult<TPayload>>;

  async execute(context: AgentContext): Promise<AgentDecision<TPayload>> {
    const result = await this.analyze(context);
    let promptVersion = 'n/a';
    let llmVersion = context.llm.model;
    let reasoning = result.reasoning;

    // LLM enrichment: heuristic result + retrieved knowledge become the prompt.
    try {
      const knowledge = context.memory
        .retrieve(context.tenantId, `${this.definition.name} ${context.subjectId}`, 3)
        .map((k) => `- [${k.document.source}] ${k.chunk.slice(0, 200)}`)
        .join('\n');
      const rendered = context.prompts.render(this.definition.promptId, {
        subjectId: context.subjectId,
        input: JSON.stringify(context.input).slice(0, 4000),
        heuristics: JSON.stringify(result.payload).slice(0, 4000),
        knowledge: knowledge || 'No relevant knowledge retrieved.',
      });
      promptVersion = rendered.version;
      const llmResponse = await context.llm.complete({
        system: rendered.system,
        prompt: rendered.prompt,
        maxTokens: 2048,
      });
      llmVersion = llmResponse.model;
      reasoning = `${result.reasoning}\n\nModel narrative: ${llmResponse.text}`;
    } catch {
      // LLM enrichment is best-effort; heuristic reasoning stands on its own.
    }

    return {
      id: newId('dec'),
      tenantId: context.tenantId,
      agentId: this.definition.id,
      workflowRunId: context.workflowRunId,
      stepId: context.stepId,
      subjectType: context.subjectType,
      subjectId: context.subjectId,
      input: { ...context.input },
      reasoning,
      evidence: result.evidence,
      confidence: clamp(result.confidence, 0, 1),
      risk: result.risk,
      businessImpact: result.businessImpact,
      technicalImpact: result.technicalImpact,
      complianceImpact: result.complianceImpact,
      recommendedAction: result.recommendedAction,
      alternativeRecommendations: result.alternativeRecommendations,
      approvalStatus: this.definition.gatekeeper ? 'PENDING' : 'AUTO_APPROVED',
      payload: result.payload,
      promptVersion,
      llmVersion,
      knowledgeVersion: context.memory.version,
      createdAt: nowIso(),
      version: 1,
    };
  }
}

/** Convenience: read `passed` from a gatekeeper decision payload. */
export function gatePassed(decision: AgentDecision): boolean {
  const payload = decision.payload as { passed?: boolean } | undefined;
  return payload?.passed !== false;
}

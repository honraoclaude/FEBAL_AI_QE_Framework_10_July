import type { AgentRegistry, PromptLibrary, WorkflowEngine } from '@qe-ai/agent-kernel';
import { ALL_AGENT_DEFINITIONS, REFINEMENT_AGENTS } from './catalog.js';
import { AGENT_ASPECTS, HeuristicAgent } from './heuristics.js';
import { createRefinementAgents } from './refinement.js';
import { ApexUnitTestGeneratorAgent, CodeReviewAgent } from './devAgents.js';
import { ALL_WORKFLOWS } from './workflows.js';
import { registerPrompts } from './prompts.js';

export * from './catalog.js';
export * from './heuristics.js';
export * from './refinement.js';
export * from './devAgents.js';
export * from './apex.js';
export * from './workflows.js';
export * from './prompts.js';

/**
 * Registers the full agent catalog: deep implementations for refinement,
 * heuristic+LLM implementations for everything else.
 */
export function registerAllAgents(registry: AgentRegistry): void {
  for (const agent of createRefinementAgents()) {
    registry.register(agent);
  }
  // Deep development agents: real branch analysis with heuristic fallback.
  registry.register(new CodeReviewAgent());
  registry.register(new ApexUnitTestGeneratorAgent());
  const deepIds = new Set([...REFINEMENT_AGENTS.map((d) => d.id), 'code-review', 'apex-unit-test-generator']);
  for (const definition of ALL_AGENT_DEFINITIONS) {
    if (deepIds.has(definition.id)) continue;
    const aspects = AGENT_ASPECTS[definition.id] ?? ['Fitness for purpose', 'Risk', 'Completeness'];
    registry.register(new HeuristicAgent(definition, aspects));
  }
}

/** Registers default workflows for all five phases. */
export function registerAllWorkflows(engine: WorkflowEngine): void {
  for (const workflow of ALL_WORKFLOWS) {
    engine.define(workflow);
  }
}

/** One-call platform bootstrap for the agent layer. */
export function bootstrapAgentPlatform(registry: AgentRegistry, engine: WorkflowEngine, prompts: PromptLibrary): void {
  registerPrompts(prompts);
  registerAllAgents(registry);
  registerAllWorkflows(engine);
}

/**
 * Phase 1 refinement agents — one deep agent per file, shared helpers in
 * `shared.ts`. Composition happens here.
 */
export * from './shared.js';
export * from './storyAnalysis.js';
export * from './salesforceImpact.js';
export * from './threeAmigos.js';
export * from './fcaRegulatory.js';
export * from './consumerDuty.js';
export * from './bddDesigner.js';
export * from './automationRecommendation.js';
export * from './gatekeeper.js';

import { StoryAnalysisAgent } from './storyAnalysis.js';
import { SalesforceImpactAgent } from './salesforceImpact.js';
import { ThreeAmigosAgent } from './threeAmigos.js';
import { FcaRegulatoryAgent } from './fcaRegulatory.js';
import { ConsumerDutyAgent } from './consumerDuty.js';
import { BddDesignerAgent } from './bddDesigner.js';
import { AutomationRecommendationAgent } from './automationRecommendation.js';
import { RefinementGatekeeperAgent } from './gatekeeper.js';

export function createRefinementAgents() {
  return [
    new StoryAnalysisAgent(),
    new SalesforceImpactAgent(),
    new ThreeAmigosAgent(),
    new FcaRegulatoryAgent(),
    new ConsumerDutyAgent(),
    new BddDesignerAgent(),
    new AutomationRecommendationAgent(),
    new RefinementGatekeeperAgent(),
  ];
}

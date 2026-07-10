import { BaseAgent, type AgentContext, type AgentResult } from '@qe-ai/agent-kernel';
import { stableScore } from '../heuristics.js';
import { getDef } from './shared.js';
import type { BddPack } from './bddDesigner.js';

export interface AutomationPlan {
  recommendations: Array<{
    scenarioId: string;
    title: string;
    automate: boolean;
    roiScore: number;
    priority: 'P1' | 'P2' | 'P3';
    framework: string;
    complexity: 'LOW' | 'MEDIUM' | 'HIGH';
    maintenanceCost: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
  automationPercent: number;
}

export class AutomationRecommendationAgent extends BaseAgent<AutomationPlan> {
  constructor() {
    super(getDef('automation-recommendation'));
  }

  protected async analyze(context: AgentContext): Promise<AgentResult<AutomationPlan>> {
    const pack = context.input['bdd-designer'] as BddPack | undefined;
    const scenarios = pack?.scenarios ?? [];

    const recommendations = scenarios.map((s) => {
      const base = s.automationCandidate ? 0.6 : 0.2;
      const regressionBoost = s.tags.includes('@Regression') || s.tags.includes('@Smoke') ? 0.25 : 0;
      const roiScore = Number(Math.min(1, base + regressionBoost + stableScore('roi', s.id) * 0.15).toFixed(2));
      const framework = s.category === 'API' || s.category === 'INTEGRATION' ? 'RestAssured + Karate' : s.category === 'UI' || s.category === 'END_TO_END' ? 'Playwright (Salesforce-aware selectors)' : s.category === 'PERFORMANCE' ? 'k6' : s.tags.includes('@Unit') ? 'Apex Test Framework' : 'Playwright + Cucumber';
      const complexity = s.category === 'END_TO_END' || s.category === 'INTEGRATION' ? 'HIGH' : s.category === 'UI' ? 'MEDIUM' : 'LOW';
      return {
        scenarioId: s.id,
        title: s.title,
        automate: roiScore >= 0.55,
        roiScore,
        priority: (roiScore >= 0.8 ? 'P1' : roiScore >= 0.6 ? 'P2' : 'P3') as 'P1' | 'P2' | 'P3',
        framework,
        complexity: complexity as 'LOW' | 'MEDIUM' | 'HIGH',
        maintenanceCost: (complexity === 'HIGH' ? 'MEDIUM' : 'LOW') as 'LOW' | 'MEDIUM' | 'HIGH',
      };
    });
    const automationPercent = recommendations.length === 0 ? 0 : Math.round((recommendations.filter((r) => r.automate).length / recommendations.length) * 100);

    return {
      reasoning: `Scored ${recommendations.length} scenarios for automation ROI; ${recommendations.filter((r) => r.automate).length} recommended (${automationPercent}%). Frameworks selected per scenario category.`,
      evidence: recommendations.slice(0, 5).map((r) => `${r.title}: ROI ${r.roiScore}, ${r.priority}, ${r.framework}`),
      confidence: recommendations.length > 0 ? 0.85 : 0.5,
      risk: 'LOW',
      businessImpact: `Target automation coverage of ${automationPercent}% reduces regression cost per release.`,
      technicalImpact: 'Framework mix: Playwright, Karate/RestAssured, Apex tests, k6.',
      complianceImpact: 'Automated regulated scenarios produce repeatable compliance evidence.',
      recommendedAction: `Automate the ${recommendations.filter((r) => r.priority === 'P1').length} P1 scenarios in-sprint; schedule P2 next sprint.`,
      alternativeRecommendations: ['Defer P3 automation until stability data accumulates.'],
      payload: { recommendations, automationPercent },
    };
  }
}

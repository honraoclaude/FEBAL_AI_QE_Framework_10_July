import type { RiskLevel } from '@qe-ai/contracts';
import { BaseAgent, type AgentContext, type AgentResult } from '@qe-ai/agent-kernel';
import { getDef, storyFrom, text } from './shared.js';

interface ImpactArea {
  area: string;
  impacted: boolean;
  rationale: string;
}

export interface SalesforceImpact {
  areas: ImpactArea[];
  regressionScope: string[];
  metadataDependencies: string[];
  impactedCount: number;
}

const IMPACT_RULES: Array<{ area: string; pattern: RegExp }> = [
  { area: 'Financial Services Cloud', pattern: /fsc|financial|account|household|advisor|client/ },
  { area: 'Sales Cloud', pattern: /opportunity|lead|quote|sales|pipeline/ },
  { area: 'Marketing Cloud', pattern: /campaign|journey|email|marketing|promotion/ },
  { area: 'Service Cloud', pattern: /case|complaint|service|support|omni-?channel/ },
  { area: 'Experience Cloud', pattern: /portal|community|experience|self-?service|customer.*(login|site)/ },
  { area: 'Data Cloud', pattern: /segment|cdp|data cloud|profile unification/ },
  { area: 'Apex', pattern: /apex|trigger|batch|queueable|controller|calculation|logic/ },
  { area: 'Flows', pattern: /flow|automation|process/ },
  { area: 'LWC', pattern: /component|lwc|screen|page|ui|form/ },
  { area: 'Validation Rules', pattern: /validation|mandatory|required field/ },
  { area: 'Profiles & Permission Sets', pattern: /permission|profile|access|role/ },
  { area: 'Sharing Rules', pattern: /sharing|visibility|record access/ },
  { area: 'OmniStudio', pattern: /omniscript|omnistudio|dataraptor|integration procedure/ },
  { area: 'CPQ', pattern: /cpq|pricing|quote|discount/ },
  { area: 'MuleSoft', pattern: /mulesoft|mule|api-?led|integration/ },
  { area: 'External APIs', pattern: /external|third.?party|rest|soap|webhook|api/ },
];

export class SalesforceImpactAgent extends BaseAgent<SalesforceImpact> {
  constructor() {
    super(getDef('salesforce-impact'));
  }

  protected async analyze(context: AgentContext): Promise<AgentResult<SalesforceImpact>> {
    const story = storyFrom(context);
    const t = text(story);
    const areas: ImpactArea[] = IMPACT_RULES.map(({ area, pattern }) => {
      const impacted = pattern.test(t);
      return {
        area,
        impacted,
        rationale: impacted ? `Story language matches ${area} concepts (${pattern.source.split('|')[0]}…).` : 'No signal in story text.',
      };
    });
    const impacted = areas.filter((a) => a.impacted);
    const regressionScope = impacted.map((a) => `${a.area} regression pack`);
    const metadataDependencies = impacted.flatMap((a) =>
      a.area === 'Apex' ? ['Classes', 'Triggers'] : a.area === 'Flows' ? ['Flow definitions'] : a.area === 'LWC' ? ['LightningComponentBundles'] : [],
    );

    const payload: SalesforceImpact = {
      areas,
      regressionScope: regressionScope.length > 0 ? regressionScope : ['Core smoke pack'],
      metadataDependencies,
      impactedCount: impacted.length,
    };
    const risk: RiskLevel = impacted.length >= 6 ? 'HIGH' : impacted.length >= 3 ? 'MEDIUM' : 'LOW';

    return {
      reasoning: `Detected ${impacted.length}/${areas.length} impacted Salesforce areas: ${impacted.map((a) => a.area).join(', ') || 'none beyond core smoke scope'}. Regression scope derived from impacted areas.`,
      evidence: impacted.map((a) => a.rationale),
      confidence: impacted.length > 0 ? 0.85 : 0.7,
      risk,
      businessImpact: impacted.length >= 3 ? 'Broad functional surface; coordinate cross-cloud stakeholders.' : 'Contained functional surface.',
      technicalImpact: `Regression scope: ${payload.regressionScope.join(', ')}.`,
      complianceImpact: 'Impact analysis informs regulated-journey regression selection.',
      recommendedAction: `Include ${payload.regressionScope.join(', ')} in the test plan; verify metadata dependencies (${metadataDependencies.join(', ') || 'none'}).`,
      alternativeRecommendations: ['Run full regression if release window allows.'],
      payload,
    };
  }
}

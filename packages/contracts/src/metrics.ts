/** Dashboard and quality metrics contracts. */

export interface TrendPoint {
  label: string;
  value: number;
}

export interface DashboardSnapshot {
  aiHealth: number;
  sprintHealth: number;
  releaseHealth: number;
  compliance: number;
  qualityScore: number;
  automationPercent: number;
  riskScore: number;
  productionStability: number;
  storyProgress: { total: number; refined: number; inDev: number; inTest: number; done: number };
  defectTrend: TrendPoint[];
  qualityTrend: TrendPoint[];
  automationTrend: TrendPoint[];
  pendingApprovals: number;
  activeAgents: number;
  degradedAgents: number;
}

export interface SquadMetrics {
  sprintQuality: number;
  automationPercent: number;
  defectLeakage: number;
  escapedDefects: number;
  regressionCoverage: number;
  leadTimeDays: number;
  cycleTimeDays: number;
  mttrHours: number;
  executionTrend: TrendPoint[];
}

export interface LeadershipMetrics {
  qualityMaturity: number;
  costOfQualityUsd: number;
  automationRoiPercent: number;
  aiAdoptionPercent: number;
  releaseSuccessPercent: number;
  productionStability: number;
  customerImpactIncidents: number;
  qualityTrend: TrendPoint[];
  predictiveRisk: number;
  complianceHealth: number;
  technicalDebtDays: number;
}

export interface Prediction {
  id: string;
  kind:
    | 'SPRINT_SUCCESS'
    | 'RELEASE_FAILURE'
    | 'DEFECT_LEAKAGE'
    | 'AUTOMATION_ROI'
    | 'TECHNICAL_DEBT'
    | 'COMPLIANCE_RISK'
    | 'PRODUCTION_INCIDENT'
    | 'QUALITY_MATURITY';
  subjectId: string;
  probability: number;
  narrative: string;
  drivers: string[];
  generatedAt: string;
}

/** UI-facing types mirroring @qe-ai/contracts (kept dependency-free for the browser bundle). */

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

export interface WorkItem {
  id: string;
  jiraKey: string;
  type: string;
  title: string;
  description: string;
  status: string;
  stage: string;
  storyPoints?: number;
  sprintId?: string;
  labels: string[];
  acceptanceCriteria: Array<{ id: string; text: string; testable: boolean }>;
  linkedPullRequests: string[];
  linkedDefectKeys: string[];
  updatedAt: string;
}

export interface Sprint {
  id: string;
  name: string;
  goal: string;
  state: string;
  startDate: string;
  endDate: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  phase: string;
  description: string;
  gatekeeper: boolean;
  approverRoles: string[];
  tags: string[];
}

export interface AgentHealth {
  agentId: string;
  status: string;
  lastRunAt?: string;
  runsToday: number;
  failuresToday: number;
  avgLatencyMs: number;
  avgConfidence: number;
}

export interface StepRun {
  stepId: string;
  agentId: string;
  status: string;
  attempts: number;
  decisionId?: string;
  error?: string;
}

export interface WorkflowRun {
  id: string;
  definitionId: string;
  subjectType: string;
  subjectId: string;
  status: string;
  steps: StepRun[];
  startedAt: string;
  finishedAt?: string;
  triggeredBy: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  phase: string;
  description: string;
  steps: Array<{ id: string; agentId: string; humanApproval?: boolean; parallelGroup?: string }>;
}

export interface AgentDecision {
  id: string;
  agentId: string;
  subjectId: string;
  reasoning: string;
  evidence: string[];
  confidence: number;
  risk: string;
  businessImpact: string;
  technicalImpact: string;
  complianceImpact: string;
  recommendedAction: string;
  alternativeRecommendations: string[];
  approvalStatus: string;
  promptVersion: string;
  llmVersion: string;
  knowledgeVersion: string;
  createdAt: string;
  payload: unknown;
}

export interface ApprovalRequest {
  id: string;
  type: string;
  title: string;
  status: string;
  subjectId: string;
  requiredRoles: string[];
  requestedBy: string;
  decisionId?: string;
  createdAt: string;
  resolvedBy?: string;
  comments: Array<{ authorId: string; text: string; createdAt: string }>;
}

export interface AuditEvent {
  id: string;
  seq: number;
  kind: string;
  actor: string;
  summary: string;
  agentId?: string;
  subjectId?: string;
  timestamp: string;
  hash: string;
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
  kind: string;
  probability: number;
  narrative: string;
  drivers: string[];
}

export interface KnowledgeDocument {
  id: string;
  source: string;
  title: string;
  content: string;
  version: number;
  tags: string[];
  ingestedAt: string;
}

export interface SyncResult {
  id: string;
  mode: string;
  direction: string;
  startedAt: string;
  finishedAt: string;
  pulled: number;
  pushed: number;
  updated: number;
  conflicts: unknown[];
  errors: string[];
}

export interface JiraStatus {
  connection: {
    baseUrl: string;
    connected: boolean;
    lastSyncAt?: string;
    direction: string;
    projectKeys: string[];
    scheduleCron?: string;
  };
  history: SyncResult[];
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
}

export interface Tenant {
  id: string;
  name: string;
  plan: string;
  region: string;
  settings: {
    gateConfidenceThreshold: number;
    llmProvider: string;
    llmModel: string;
    dataResidency: string;
    regulatoryProfiles: string[];
    humanApprovalRequired: string[];
  };
}

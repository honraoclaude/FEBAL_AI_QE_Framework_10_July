import type { JiraConnection, SyncConflict, SyncMode, SyncResult, WorkItem } from '@qe-ai/contracts';
import { newId, nowIso, type AuditTrail, type EventBus } from '@qe-ai/agent-kernel';
import type { SprintStore, WorkItemStore } from './stores.js';

/**
 * JIRA synchronization.
 *
 * `JiraPort` is the outbound port; `MockJiraAdapter` simulates a connected
 * JIRA Cloud instance so the platform is fully functional out of the box.
 * The production adapter implements the same port against the JIRA Cloud REST
 * API with OAuth 2.0 (3LO) — tokens held in the secrets manager.
 */

export interface JiraIssuePayload {
  jiraKey: string;
  type: WorkItem['type'];
  title: string;
  description: string;
  status: string;
  storyPoints?: number;
  sprintJiraId?: string;
  labels: string[];
  acceptanceCriteria: Array<{ id: string; text: string; testable: boolean }>;
  linkedPullRequests: string[];
  linkedDefectKeys: string[];
  updatedAt: string;
}

export interface JiraPort {
  fetchIssues(connection: JiraConnection, since?: string): Promise<JiraIssuePayload[]>;
  pushIssue(connection: JiraConnection, item: WorkItem): Promise<void>;
}

export class MockJiraAdapter implements JiraPort {
  private pushed: WorkItem[] = [];

  constructor(private remoteIssues: JiraIssuePayload[] = []) {}

  setRemoteIssues(issues: JiraIssuePayload[]): void {
    this.remoteIssues = issues;
  }

  async fetchIssues(_connection: JiraConnection, since?: string): Promise<JiraIssuePayload[]> {
    if (!since) return this.remoteIssues;
    return this.remoteIssues.filter((i) => i.updatedAt > since);
  }

  async pushIssue(_connection: JiraConnection, item: WorkItem): Promise<void> {
    this.pushed.push(item);
  }

  get pushedCount(): number {
    return this.pushed.length;
  }
}

export class JiraSyncService {
  private connection: JiraConnection;
  private results: SyncResult[] = [];

  constructor(
    private readonly tenantId: string,
    private readonly port: JiraPort,
    private readonly workItems: WorkItemStore,
    private readonly sprints: SprintStore,
    private readonly audit: AuditTrail,
    private readonly bus: EventBus,
  ) {
    this.connection = {
      tenantId,
      baseUrl: 'https://demo.atlassian.net',
      oauthClientId: 'qe-ai-demo-client',
      projectKeys: ['FSC'],
      connected: true,
      direction: 'BIDIRECTIONAL',
      scheduleCron: '*/15 * * * *',
    };
  }

  status(): JiraConnection {
    return this.connection;
  }

  history(): SyncResult[] {
    return this.results;
  }

  async sync(mode: SyncMode, triggeredBy: string): Promise<SyncResult> {
    const startedAt = nowIso();
    const since = mode === 'INCREMENTAL' ? this.connection.lastSyncAt : undefined;
    const issues = await this.port.fetchIssues(this.connection, since);

    let pulled = 0;
    let updated = 0;
    const conflicts: SyncConflict[] = [];

    for (const issue of issues) {
      const existing = this.workItems.byJiraKey(this.tenantId, issue.jiraKey);
      const sprint = issue.sprintJiraId
        ? this.sprints.list(this.tenantId).find((s) => s.jiraId === issue.sprintJiraId)
        : undefined;

      if (!existing) {
        this.workItems.upsert({
          id: newId('wi'),
          tenantId: this.tenantId,
          jiraKey: issue.jiraKey,
          type: issue.type,
          title: issue.title,
          description: issue.description,
          status: issue.status,
          stage: 'BACKLOG',
          storyPoints: issue.storyPoints,
          sprintId: sprint?.id,
          labels: issue.labels,
          acceptanceCriteria: issue.acceptanceCriteria.map((ac) => ({ ...ac, coveredByScenarioIds: [] })),
          linkedPullRequests: issue.linkedPullRequests,
          linkedDefectKeys: issue.linkedDefectKeys,
          linkedTestCaseIds: [],
          createdAt: nowIso(),
          updatedAt: issue.updatedAt,
        });
        pulled += 1;
      } else {
        // Conflict detection: both sides changed since last sync.
        const localChanged = this.connection.lastSyncAt && existing.updatedAt > this.connection.lastSyncAt;
        const remoteChanged = this.connection.lastSyncAt && issue.updatedAt > this.connection.lastSyncAt;
        if (localChanged && remoteChanged && existing.title !== issue.title) {
          conflicts.push({
            workItemId: existing.id,
            field: 'title',
            localValue: existing.title,
            remoteValue: issue.title,
            detectedAt: nowIso(),
            resolution: 'REMOTE_WINS',
          });
        }
        existing.title = issue.title;
        existing.description = issue.description;
        existing.status = issue.status;
        existing.storyPoints = issue.storyPoints;
        existing.labels = issue.labels;
        existing.sprintId = sprint?.id ?? existing.sprintId;
        existing.updatedAt = issue.updatedAt;
        this.workItems.upsert(existing);
        updated += 1;
      }
    }

    // Bidirectional: push locally-progressed stages back as JIRA status.
    let pushed = 0;
    if (this.connection.direction !== 'PULL') {
      for (const item of this.workItems.list(this.tenantId)) {
        if (item.stage !== 'BACKLOG' && item.stage !== 'REFINEMENT') {
          await this.port.pushIssue(this.connection, item);
          pushed += 1;
        }
      }
    }

    const result: SyncResult = {
      id: newId('sync'),
      tenantId: this.tenantId,
      mode,
      direction: this.connection.direction,
      startedAt,
      finishedAt: nowIso(),
      pulled,
      pushed,
      updated,
      conflicts,
      errors: [],
    };
    this.results.push(result);
    this.connection.lastSyncAt = result.finishedAt;

    this.audit.record({
      tenantId: this.tenantId,
      kind: 'JIRA_SYNC',
      actor: triggeredBy,
      summary: `JIRA ${mode} sync: ${pulled} pulled, ${updated} updated, ${pushed} pushed, ${conflicts.length} conflicts`,
      detail: { syncId: result.id, mode, conflicts },
    });
    await this.bus.publish(this.tenantId, 'jira.sync.completed', { syncId: result.id }, 'jira-sync');
    return result;
  }
}

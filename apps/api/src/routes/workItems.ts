import type { FastifyInstance } from 'fastify';
import type { SyncMode } from '@qe-ai/contracts';
import type { RouteContext } from './context.js';

/** Sprints, backlog, stories and JIRA synchronisation. */
export function registerWorkItemRoutes(app: FastifyInstance, { platform, currentUser }: RouteContext): void {
  const { tenantId, workItems, sprints, engine, executions, jira } = platform;

  app.get('/api/v1/sprints', async () => sprints.list(tenantId));
  app.get('/api/v1/sprints/current', async (_req, reply) => {
    const sprint = sprints.active(tenantId);
    if (!sprint) return reply.code(404).send({ error: 'No active sprint' });
    return { sprint, items: workItems.inSprint(tenantId, sprint.id) };
  });
  app.get('/api/v1/backlog', async () => workItems.backlog(tenantId));
  app.get('/api/v1/stories', async () => workItems.list(tenantId));
  app.get<{ Params: { id: string } }>('/api/v1/stories/:id', async (request, reply) => {
    const item = workItems.get(request.params.id) ?? workItems.byJiraKey(tenantId, request.params.id);
    if (!item) return reply.code(404).send({ error: 'Not found' });
    return {
      item,
      decisions: engine.listDecisions(tenantId, item.id),
      runs: engine.listRuns(tenantId).filter((r) => r.subjectId === item.id),
      executions: executions.list(tenantId).filter((e) => e.storyId === item.jiraKey || e.storyId === item.id),
    };
  });

  app.get('/api/v1/jira/status', async () => ({ connection: jira.status(), history: jira.history() }));
  app.post<{ Body: { mode?: SyncMode } }>('/api/v1/jira/sync', async (request) => {
    const mode = request.body?.mode ?? 'MANUAL';
    return jira.sync(mode, currentUser(request).email);
  });
}

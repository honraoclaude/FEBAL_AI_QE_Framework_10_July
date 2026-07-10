import type { FastifyInstance } from 'fastify';
import { toStoryInput, type RouteContext } from './context.js';

/** Workflow definitions, run lifecycle and governed decisions. */
export function registerWorkflowRoutes(app: FastifyInstance, { platform, currentUser }: RouteContext): void {
  const { tenantId, engine, workItems } = platform;

  app.get('/api/v1/workflows', async () => engine.listDefinitions());
  app.post<{ Params: { id: string }; Body: { subjectId: string; detached?: boolean } }>(
    '/api/v1/workflows/:id/start',
    async (request, reply) => {
      const { subjectId, detached } = request.body ?? {};
      if (!subjectId) return reply.code(400).send({ error: 'subjectId is required' });
      const item = workItems.get(subjectId) ?? workItems.byJiraKey(tenantId, subjectId);
      try {
        const run = await engine.start({
          tenantId,
          definitionId: request.params.id,
          subjectType: request.params.id === 'deploy-learn' ? 'DEPLOYMENT' : request.params.id === 'release' ? 'RELEASE' : 'STORY',
          subjectId: item?.id ?? subjectId,
          triggeredBy: currentUser(request).email,
          initialContext: item ? { story: toStoryInput(item) } : {},
          detached,
        });
        // Stage progression on refinement completion is event-driven (see
        // platform.ts) so it also applies to detached runs.
        return run;
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : 'Failed to start workflow' });
      }
    },
  );

  app.get('/api/v1/runs', async () => engine.listRuns(tenantId));
  app.get<{ Params: { id: string } }>('/api/v1/runs/:id', async (request, reply) => {
    const run = engine.getRun(request.params.id);
    if (!run) return reply.code(404).send({ error: 'Not found' });
    return run;
  });
  app.get<{ Params: { id: string } }>('/api/v1/runs/:id/diagram', async (request, reply) => {
    try {
      return { mermaid: engine.visualize(request.params.id) };
    } catch {
      return reply.code(404).send({ error: 'Not found' });
    }
  });
  app.post<{ Params: { id: string } }>('/api/v1/runs/:id/pause', async (request, reply) => {
    try {
      return engine.pause(request.params.id, currentUser(request).email);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'pause failed' });
    }
  });
  app.post<{ Params: { id: string } }>('/api/v1/runs/:id/resume', async (request, reply) => {
    try {
      return await engine.resume(request.params.id, currentUser(request).email);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'resume failed' });
    }
  });
  app.post<{ Params: { id: string } }>('/api/v1/runs/:id/rollback', async (request, reply) => {
    try {
      return await engine.rollback(request.params.id, currentUser(request).email);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'rollback failed' });
    }
  });

  app.get<{ Querystring: { subjectId?: string } }>('/api/v1/decisions', async (request) =>
    engine.listDecisions(tenantId, request.query.subjectId),
  );
  app.get<{ Params: { id: string } }>('/api/v1/decisions/:id', async (request, reply) => {
    const decision = engine.getDecision(request.params.id);
    if (!decision) return reply.code(404).send({ error: 'Not found' });
    return decision;
  });
}

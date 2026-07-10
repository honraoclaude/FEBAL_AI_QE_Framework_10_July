import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import type { ApprovalStatus, SyncMode, User } from '@qe-ai/contracts';
import type { StoryInput } from '@qe-ai/agents';
import type { Platform } from './platform.js';

/**
 * REST API. All routes are tenant-scoped and (demo) token-authenticated.
 * Demo auth: `Authorization: Bearer demo-<userId>` (see seed users);
 * unauthenticated requests act as the read-only viewer in demo mode.
 * Production replaces the auth hook with OAuth2/OIDC + SAML via the gateway.
 */
export async function buildServer(platform: Platform): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  const {
    tenantId,
    engine,
    registry,
    approvals,
    audit,
    feedback,
    memory,
    workItems,
    sprints,
    users,
    jira,
    metrics,
    tenants,
    executions,
    bus,
  } = platform;

  function currentUser(request: FastifyRequest): User {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const user = users.byToken(header.slice(7));
      if (user) return user;
    }
    return {
      id: 'viewer',
      tenantId,
      email: 'viewer@demo',
      displayName: 'Demo Viewer',
      roles: ['ADMIN'],
      active: true,
    };
  }

  app.get('/health', async () => ({ status: 'ok', service: 'qe-ai-api', time: new Date().toISOString() }));

  // ---- Dashboard & metrics ----
  app.get('/api/v1/dashboard', async () => metrics.dashboard());
  app.get('/api/v1/metrics/squad', async () => metrics.squad());
  app.get('/api/v1/metrics/leadership', async () => metrics.leadership());
  app.get('/api/v1/metrics/predictions', async () => metrics.predictions());

  // ---- Work items ----
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

  // ---- JIRA sync ----
  app.get('/api/v1/jira/status', async () => ({ connection: jira.status(), history: jira.history() }));
  app.post<{ Body: { mode?: SyncMode } }>('/api/v1/jira/sync', async (request) => {
    const mode = request.body?.mode ?? 'MANUAL';
    return jira.sync(mode, currentUser(request).email);
  });

  // ---- Agents ----
  app.get('/api/v1/agents', async () => registry.list());
  app.get('/api/v1/agents/health', async () => registry.listHealth());
  app.get<{ Params: { id: string } }>('/api/v1/agents/:id', async (request, reply) => {
    try {
      const agent = registry.get(request.params.id);
      return { definition: agent.definition, health: registry.getHealth(request.params.id) };
    } catch {
      return reply.code(404).send({ error: 'Unknown agent' });
    }
  });

  // ---- Workflows ----
  app.get('/api/v1/workflows', async () => engine.listDefinitions());
  app.post<{ Params: { id: string }; Body: { subjectId: string } }>(
    '/api/v1/workflows/:id/start',
    async (request, reply) => {
      const { subjectId } = request.body ?? {};
      if (!subjectId) return reply.code(400).send({ error: 'subjectId is required' });
      const item = workItems.get(subjectId) ?? workItems.byJiraKey(tenantId, subjectId);
      const story: StoryInput | undefined = item
        ? {
            id: item.id,
            jiraKey: item.jiraKey,
            title: item.title,
            description: item.description,
            storyPoints: item.storyPoints,
            labels: item.labels,
            acceptanceCriteria: item.acceptanceCriteria.map((ac) => ({ id: ac.id, text: ac.text, testable: ac.testable })),
          }
        : undefined;
      try {
        const run = await engine.start({
          tenantId,
          definitionId: request.params.id,
          subjectType: request.params.id === 'deploy-learn' ? 'DEPLOYMENT' : request.params.id === 'release' ? 'RELEASE' : 'STORY',
          subjectId: item?.id ?? subjectId,
          triggeredBy: currentUser(request).email,
          initialContext: story ? { story } : {},
        });
        if (item && request.params.id === 'refinement' && run.status === 'COMPLETED') {
          item.stage = 'DEVELOPMENT_READY';
          workItems.upsert(item);
        }
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

  // ---- Decisions & governance ----
  app.get<{ Querystring: { subjectId?: string } }>('/api/v1/decisions', async (request) =>
    engine.listDecisions(tenantId, request.query.subjectId),
  );
  app.get<{ Params: { id: string } }>('/api/v1/decisions/:id', async (request, reply) => {
    const decision = engine.getDecision(request.params.id);
    if (!decision) return reply.code(404).send({ error: 'Not found' });
    return decision;
  });

  // ---- Approvals ----
  app.get<{ Querystring: { status?: ApprovalStatus } }>('/api/v1/approvals', async (request) =>
    approvals.list(tenantId, request.query.status),
  );
  app.post<{ Params: { id: string }; Body: { status: ApprovalStatus; comment?: string } }>(
    '/api/v1/approvals/:id/resolve',
    async (request, reply) => {
      const user = currentUser(request);
      try {
        return await approvals.resolve({
          approvalId: request.params.id,
          status: request.body.status,
          resolvedBy: user.email,
          resolverRoles: user.roles,
          comment: request.body.comment,
        });
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : 'resolve failed' });
      }
    },
  );
  app.get('/api/v1/approvals/matrix', async () => approvals.getMatrix());

  // ---- Audit ----
  app.get<{ Querystring: { subjectId?: string; limit?: string } }>('/api/v1/audit', async (request) =>
    audit.query(tenantId, {
      subjectId: request.query.subjectId,
      limit: request.query.limit ? Number(request.query.limit) : undefined,
    }),
  );
  app.get('/api/v1/audit/verify', async () => {
    const broken = audit.verifyChain(tenantId);
    return { intact: broken === null, firstBrokenSeq: broken };
  });
  app.get('/api/v1/audit/export', async (_request, reply) => {
    reply.header('content-type', 'application/x-ndjson');
    reply.header('content-disposition', 'attachment; filename="qe-ai-audit.ndjson"');
    return audit.export(tenantId);
  });

  // ---- Feedback loop ----
  app.get('/api/v1/feedback', async () => feedback.list(tenantId));
  app.post<{ Body: { decisionId: string; outcome: 'ACCEPTED' | 'REJECTED' | 'MODIFIED'; comments?: string; learningOutcome?: string } }>(
    '/api/v1/feedback',
    async (request, reply) => {
      const { decisionId, outcome, comments, learningOutcome } = request.body ?? {};
      if (!decisionId || !outcome) return reply.code(400).send({ error: 'decisionId and outcome are required' });
      return feedback.record({
        tenantId,
        decisionId,
        outcome,
        reviewerId: currentUser(request).email,
        reviewerComments: comments,
        learningOutcome,
      });
    },
  );

  // ---- Knowledge ----
  app.get('/api/v1/knowledge', async () => memory.listDocuments(tenantId));
  app.post<{ Body: { query: string; topK?: number } }>('/api/v1/knowledge/search', async (request, reply) => {
    if (!request.body?.query) return reply.code(400).send({ error: 'query is required' });
    return memory.retrieve(tenantId, request.body.query, request.body.topK ?? 5);
  });
  app.post<{ Body: { source: string; title: string; content: string; tags?: string[] } }>(
    '/api/v1/knowledge',
    async (request, reply) => {
      const { source, title, content, tags } = request.body ?? {};
      if (!title || !content) return reply.code(400).send({ error: 'title and content are required' });
      const doc = memory.ingest({
        tenantId,
        source: (source as never) ?? 'INTERNAL_STANDARD',
        title,
        content,
        tags: tags ?? [],
      });
      audit.record({
        tenantId,
        kind: 'KNOWLEDGE_UPDATED',
        actor: currentUser(request).email,
        summary: `Knowledge ingested: ${title}`,
        detail: { documentId: doc.id, source },
      });
      return doc;
    },
  );

  // ---- Administration ----
  app.get('/api/v1/tenant', async () => tenants.get(tenantId));
  app.get('/api/v1/users', async () => users.list(tenantId));
  app.get('/api/v1/events', async () => bus.recent(tenantId, 100));

  return app;
}

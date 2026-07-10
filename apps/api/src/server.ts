import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import type { ApprovalStatus, SyncMode, User } from '@qe-ai/contracts';
import type { GeneratedTest, StoryInput } from '@qe-ai/agents';
import type { Platform } from './platform.js';
import { ApexTestRunner, collectBranchReview, writeGeneratedTests } from './devtools.js';

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

  // ---- Agent re-evaluation ----
  // Re-runs a single agent for a subject as a governed one-step workflow:
  // fresh story data + the latest upstream payloads. Every re-evaluation is a
  // new decision, so the full history is preserved (spec: Three Amigos
  // approve/reject/re-evaluate with complete history).
  app.post<{ Params: { agentId: string }; Body: { subjectId: string } }>(
    '/api/v1/agents/:agentId/reevaluate',
    async (request, reply) => {
      const { agentId } = request.params;
      const { subjectId } = request.body ?? {};
      if (!subjectId) return reply.code(400).send({ error: 'subjectId is required' });
      if (!registry.has(agentId)) return reply.code(404).send({ error: `Unknown agent: ${agentId}` });

      const item = workItems.get(subjectId) ?? workItems.byJiraKey(tenantId, subjectId);
      const resolvedSubjectId = item?.id ?? subjectId;

      // Context: the story plus the most recent payload from every agent that
      // has previously assessed this subject (upstream inputs stay fresh).
      const initialContext: Record<string, unknown> = {};
      for (const decision of engine
        .listDecisions(tenantId, resolvedSubjectId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        initialContext[decision.agentId] = decision.payload;
      }
      if (item) {
        initialContext['story'] = {
          id: item.id,
          jiraKey: item.jiraKey,
          title: item.title,
          description: item.description,
          storyPoints: item.storyPoints,
          labels: item.labels,
          acceptanceCriteria: item.acceptanceCriteria.map((ac) => ({ id: ac.id, text: ac.text, testable: ac.testable })),
        } satisfies StoryInput;
      }

      const definitionId = `reevaluate-${agentId}`;
      if (!engine.getDefinition(definitionId)) {
        const agent = registry.get(agentId);
        engine.define({
          id: definitionId,
          name: `Re-evaluate ${agent.definition.name}`,
          phase: agent.definition.phase,
          description: `On-demand re-evaluation of ${agent.definition.name} for a single subject.`,
          version: 1,
          steps: [{ id: 'reevaluate', agentId, maxRetries: 0 }],
        });
      }

      try {
        const run = await engine.start({
          tenantId,
          definitionId,
          subjectType: 'STORY',
          subjectId: resolvedSubjectId,
          triggeredBy: currentUser(request).email,
          initialContext,
        });
        const decision = run.steps[0]?.decisionId ? engine.getDecision(run.steps[0].decisionId) : undefined;
        return { run, decision };
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : 'Re-evaluation failed' });
      }
    },
  );

  // ---- Workflows ----
  app.get('/api/v1/workflows', async () => engine.listDefinitions());
  app.post<{ Params: { id: string }; Body: { subjectId: string; detached?: boolean } }>(
    '/api/v1/workflows/:id/start',
    async (request, reply) => {
      const { subjectId, detached } = request.body ?? {};
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

  // ---- Developer tools: branch review + Apex test generation/execution ----
  const apexRunner = new ApexTestRunner();

  app.post<{ Body: { repoPath?: string; baseRef?: string; headRef: string; writeTests?: boolean } }>(
    '/api/v1/devtools/branch-review',
    async (request, reply) => {
      const { repoPath = process.cwd(), baseRef = 'main', headRef, writeTests = true } = request.body ?? {};
      if (!headRef) return reply.code(400).send({ error: 'headRef (the branch to review) is required' });
      try {
        const branchReview = await collectBranchReview(repoPath, baseRef, headRef);
        const runResult = await engine.start({
          tenantId,
          definitionId: 'branch-review',
          subjectType: 'PLATFORM',
          subjectId: `branch:${headRef}`,
          triggeredBy: currentUser(request).email,
          initialContext: { branchReview },
        });
        const reviewDecision = engine.getDecision(runResult.steps[0]?.decisionId ?? '');
        const testGenDecision = engine.getDecision(runResult.steps[1]?.decisionId ?? '');
        const generated = (testGenDecision?.payload as { generated?: GeneratedTest[] } | undefined)?.generated ?? [];
        const writtenTo = writeTests ? await writeGeneratedTests(repoPath, generated) : [];
        return {
          run: runResult,
          review: reviewDecision,
          testGeneration: testGenDecision,
          generatedTestFiles: writtenTo,
          apexRun: await apexRunner.availability(repoPath),
        };
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : 'branch review failed' });
      }
    },
  );

  app.post<{ Body: { repoPath?: string; testClasses: string[] } }>('/api/v1/devtools/apex-test-run', async (request, reply) => {
    const { repoPath = process.cwd(), testClasses } = request.body ?? {};
    if (!testClasses || testClasses.length === 0) return reply.code(400).send({ error: 'testClasses is required' });
    const result = await apexRunner.runTests(repoPath, testClasses);
    audit.record({
      tenantId,
      kind: 'WORKFLOW_STEP',
      actor: currentUser(request).email,
      summary: result.executed
        ? `Apex tests executed in ${result.availability.org}: ${result.outcome} (${result.passing}/${result.testsRan} passing)`
        : `Apex test run not executed: ${result.error}`,
      detail: { testClasses, result: { ...result, raw: undefined } },
    });
    return result;
  });

  app.get('/api/v1/devtools/apex-test-availability', async () => apexRunner.availability());

  // ---- Live event stream (SSE) ----
  // Bridges the platform event bus to Server-Sent Events so the UI can react
  // to workflow/approval/sync activity in real time.
  app.get('/api/v1/events/stream', (request, reply) => {
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    reply.raw.write(`: connected ${new Date().toISOString()}\n\n`);

    const unsubscribe = bus.subscribe('*', (event) => {
      if (event.tenantId !== tenantId) return;
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), 15000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return app;
}

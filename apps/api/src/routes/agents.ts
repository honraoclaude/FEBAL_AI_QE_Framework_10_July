import type { FastifyInstance } from 'fastify';
import { toStoryInput, type RouteContext } from './context.js';

/** Agent catalog, health, and on-demand re-evaluation. */
export function registerAgentRoutes(app: FastifyInstance, { platform, currentUser }: RouteContext): void {
  const { tenantId, registry, engine, workItems } = platform;

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

  // Workshop status transitions (spec: Three Amigos approve/reject/reset).
  // 'complete' approves the latest decision; 'reset' reopens it (PENDING) so
  // the workshop must be re-evaluated. Role-checked against the agent's
  // approverRoles; history is never deleted — transitions are audited.
  const statusActions: Array<{ action: string; status: 'APPROVED' | 'PENDING'; label: string }> = [
    { action: 'complete', status: 'APPROVED', label: 'marked complete' },
    { action: 'reset', status: 'PENDING', label: 'reset — re-evaluation required' },
  ];
  for (const { action, status, label } of statusActions) {
    app.post<{ Params: { agentId: string }; Body: { subjectId: string } }>(
      `/api/v1/agents/:agentId/${action}`,
      async (request, reply) => {
        const { agentId } = request.params;
        const { subjectId } = request.body ?? {};
        if (!subjectId) return reply.code(400).send({ error: 'subjectId is required' });
        if (!registry.has(agentId)) return reply.code(404).send({ error: `Unknown agent: ${agentId}` });

        const user = currentUser(request);
        const allowedRoles = registry.get(agentId).definition.approverRoles;
        if (!user.roles.includes('ADMIN') && !allowedRoles.some((role) => user.roles.includes(role))) {
          return reply.code(400).send({ error: `Roles [${user.roles.join(', ')}] are not permitted to ${action} ${agentId}; requires ${allowedRoles.join(' or ')}` });
        }

        const item = workItems.get(subjectId) ?? workItems.byJiraKey(tenantId, subjectId);
        const resolvedSubjectId = item?.id ?? subjectId;
        const latest = engine
          .listDecisions(tenantId, resolvedSubjectId)
          .filter((d) => d.agentId === agentId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (!latest) return reply.code(404).send({ error: `No ${agentId} decision exists for this subject yet — run the workshop first.` });

        const decision = await engine.updateDecisionApproval(latest.id, status, user.email, `${agentId} ${label} by ${user.displayName}`);
        return { decision, action };
      },
    );
  }

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
      if (item) initialContext['story'] = toStoryInput(item);

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
}

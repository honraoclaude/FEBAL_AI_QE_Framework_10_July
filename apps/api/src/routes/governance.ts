import type { FastifyInstance } from 'fastify';
import type { ApprovalStatus } from '@qe-ai/contracts';
import type { RouteContext } from './context.js';

/** Human approvals, immutable audit and the recommendation feedback loop. */
export function registerGovernanceRoutes(app: FastifyInstance, { platform, currentUser }: RouteContext): void {
  const { tenantId, approvals, audit, feedback } = platform;

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
}

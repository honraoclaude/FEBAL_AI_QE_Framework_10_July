import type { FastifyInstance } from 'fastify';
import type { RouteContext } from './context.js';

/** Knowledge platform: documents, semantic search, governed ingestion. */
export function registerKnowledgeRoutes(app: FastifyInstance, { platform, currentUser }: RouteContext): void {
  const { tenantId, memory, audit } = platform;

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
}

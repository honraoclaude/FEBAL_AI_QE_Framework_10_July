import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Platform } from './platform.js';
import { createCurrentUser, type RouteContext } from './routes/context.js';
import { registerMetricsRoutes } from './routes/metrics.js';
import { registerWorkItemRoutes } from './routes/workItems.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerWorkflowRoutes } from './routes/workflows.js';
import { registerGovernanceRoutes } from './routes/governance.js';
import { registerKnowledgeRoutes } from './routes/knowledge.js';
import { registerPlatformAdminRoutes } from './routes/platformAdmin.js';
import { registerDevtoolsRoutes } from './routes/devtools.js';

/**
 * REST API composition: each concern lives in its own route module under
 * `routes/`, wired with a shared RouteContext (platform services + demo
 * auth). All routes are tenant-scoped.
 */
export async function buildServer(platform: Platform): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  const context: RouteContext = { platform, currentUser: createCurrentUser(platform) };

  app.get('/health', async () => ({ status: 'ok', service: 'qe-ai-api', time: new Date().toISOString() }));

  registerMetricsRoutes(app, context);
  registerWorkItemRoutes(app, context);
  registerAgentRoutes(app, context);
  registerWorkflowRoutes(app, context);
  registerGovernanceRoutes(app, context);
  registerKnowledgeRoutes(app, context);
  registerPlatformAdminRoutes(app, context);
  registerDevtoolsRoutes(app, context);

  return app;
}

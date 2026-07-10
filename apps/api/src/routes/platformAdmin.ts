import type { FastifyInstance } from 'fastify';
import type { RouteContext } from './context.js';

/** Tenant administration and the live event stream. */
export function registerPlatformAdminRoutes(app: FastifyInstance, { platform }: RouteContext): void {
  const { tenantId, tenants, users, bus } = platform;

  app.get('/api/v1/tenant', async () => tenants.get(tenantId));
  app.get('/api/v1/users', async () => users.list(tenantId));
  app.get('/api/v1/events', async () => bus.recent(tenantId, 100));

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
}

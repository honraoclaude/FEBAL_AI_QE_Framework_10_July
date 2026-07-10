import type { FastifyInstance } from 'fastify';
import type { RouteContext } from './context.js';

/** Dashboard and quality-metrics endpoints. */
export function registerMetricsRoutes(app: FastifyInstance, { platform }: RouteContext): void {
  const { metrics } = platform;

  app.get('/api/v1/dashboard', async () => metrics.dashboard());
  app.get('/api/v1/metrics/squad', async () => metrics.squad());
  app.get('/api/v1/metrics/leadership', async () => metrics.leadership());
  app.get('/api/v1/metrics/predictions', async () => metrics.predictions());
}

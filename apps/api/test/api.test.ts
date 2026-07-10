import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { createPlatform, type Platform } from '../src/platform.js';

let app: FastifyInstance;
let platform: Platform;

beforeAll(async () => {
  platform = await createPlatform();
  app = await buildServer(platform);
});

describe('QE.ai API', () => {
  it('reports health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('serves the dashboard snapshot', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/dashboard' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.aiHealth).toBeGreaterThan(0);
    expect(body.storyProgress.total).toBeGreaterThan(0);
    expect(body.defectTrend.length).toBeGreaterThan(0);
  });

  it('synced seed stories from JIRA into sprint and backlog', async () => {
    const sprint = await app.inject({ method: 'GET', url: '/api/v1/sprints/current' });
    expect(sprint.statusCode).toBe(200);
    expect(sprint.json().items.length).toBeGreaterThanOrEqual(5);

    const backlog = await app.inject({ method: 'GET', url: '/api/v1/backlog' });
    expect(backlog.json().length).toBeGreaterThanOrEqual(3);
  });

  it('runs incremental JIRA sync', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/jira/sync', payload: { mode: 'INCREMENTAL' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().mode).toBe('INCREMENTAL');
  });

  it('lists the full agent catalog with health', async () => {
    const agents = await app.inject({ method: 'GET', url: '/api/v1/agents' });
    expect(agents.json().length).toBeGreaterThanOrEqual(85);
    const health = await app.inject({ method: 'GET', url: '/api/v1/agents/health' });
    expect(health.json().length).toBe(agents.json().length);
  });

  it('starts the refinement workflow for a story and pauses at the human gate', async () => {
    const stories = (await app.inject({ method: 'GET', url: '/api/v1/stories' })).json() as Array<{ id: string; jiraKey: string }>;
    const story = stories.find((s) => s.jiraKey === 'FSC-102')!;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workflows/refinement/start',
      payload: { subjectId: story.id },
    });
    expect(res.statusCode).toBe(200);
    const run = res.json();
    expect(run.status).toBe('AWAITING_APPROVAL');

    // Governance envelope present on every decision.
    const decisions = (await app.inject({ method: 'GET', url: `/api/v1/decisions?subjectId=${story.id}` })).json() as Array<{
      reasoning: string;
      confidence: number;
      promptVersion: string;
    }>;
    expect(decisions.length).toBeGreaterThanOrEqual(8);
    for (const d of decisions) {
      expect(d.reasoning.length).toBeGreaterThan(0);
      expect(d.confidence).toBeGreaterThan(0);
    }

    // Approve as PO; workflow completes.
    const pending = (await app.inject({ method: 'GET', url: '/api/v1/approvals?status=REVIEW' })).json() as Array<{ id: string }>;
    expect(pending.length).toBeGreaterThanOrEqual(1);
    const resolve = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/${pending[0]!.id}/resolve`,
      headers: { authorization: 'Bearer demo-po' },
      payload: { status: 'APPROVED', comment: 'Refinement evidence complete.' },
    });
    expect(resolve.statusCode).toBe(200);

    const runAfter = (await app.inject({ method: 'GET', url: `/api/v1/runs/${run.id}` })).json();
    expect(runAfter.status).toBe('COMPLETED');
  });

  it('rejects approvals from unauthorised roles', async () => {
    const stories = (await app.inject({ method: 'GET', url: '/api/v1/stories' })).json() as Array<{ id: string; jiraKey: string }>;
    const story = stories.find((s) => s.jiraKey === 'FSC-101')!;
    await app.inject({ method: 'POST', url: '/api/v1/workflows/refinement/start', payload: { subjectId: story.id } });

    const pending = (await app.inject({ method: 'GET', url: '/api/v1/approvals?status=REVIEW' })).json() as Array<{ id: string }>;
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/${pending[0]!.id}/resolve`,
      headers: { authorization: 'Bearer demo-dev' },
      payload: { status: 'APPROVED' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/not permitted/);
  });

  it('verifies the audit chain and exports it', async () => {
    const verify = await app.inject({ method: 'GET', url: '/api/v1/audit/verify' });
    expect(verify.json().intact).toBe(true);
    const exported = await app.inject({ method: 'GET', url: '/api/v1/audit/export' });
    expect(exported.statusCode).toBe(200);
    expect(exported.body.split('\n').length).toBeGreaterThan(5);
  });

  it('records feedback and searches knowledge', async () => {
    const decisions = (await app.inject({ method: 'GET', url: '/api/v1/decisions' })).json() as Array<{ id: string }>;
    const fb = await app.inject({
      method: 'POST',
      url: '/api/v1/feedback',
      headers: { authorization: 'Bearer demo-qelead' },
      payload: { decisionId: decisions[0]!.id, outcome: 'ACCEPTED', comments: 'Accurate assessment.' },
    });
    expect(fb.statusCode).toBe(200);

    const search = await app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/search',
      payload: { query: 'multi-currency fee rounding defect' },
    });
    expect(search.statusCode).toBe(200);
    expect(search.json().length).toBeGreaterThan(0);
  });

  it('serves squad and leadership metrics and predictions', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/metrics/squad' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/v1/metrics/leadership' })).statusCode).toBe(200);
    const predictions = (await app.inject({ method: 'GET', url: '/api/v1/metrics/predictions' })).json();
    expect(predictions.length).toBe(8);
  });
});

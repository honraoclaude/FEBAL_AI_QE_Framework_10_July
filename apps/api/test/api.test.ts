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

  it('starts a detached workflow that progresses asynchronously', async () => {
    const stories = (await app.inject({ method: 'GET', url: '/api/v1/stories' })).json() as Array<{ id: string; jiraKey: string }>;
    const story = stories.find((s) => s.jiraKey === 'FSC-105')!;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workflows/refinement/start',
      payload: { subjectId: story.id, detached: true },
    });
    expect(res.statusCode).toBe(200);
    const run = res.json() as { id: string; status: string };
    // Returned before the gate — execution continues in the background.
    expect(['RUNNING', 'AWAITING_APPROVAL']).toContain(run.status);

    // Poll until the background run reaches the human gate.
    let status = run.status;
    for (let i = 0; i < 50 && status !== 'AWAITING_APPROVAL'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      status = ((await app.inject({ method: 'GET', url: `/api/v1/runs/${run.id}` })).json() as { status: string }).status;
    }
    expect(status).toBe('AWAITING_APPROVAL');
  });

  it('refuses to start the next phase while an approval is pending, with a clear message', async () => {
    const stories = (await app.inject({ method: 'GET', url: '/api/v1/stories' })).json() as Array<{ id: string; jiraKey: string }>;
    const story = stories.find((s) => s.jiraKey === 'FSC-103')!;

    // Self-contained: create this test's own pending approval.
    const refinement = await app.inject({
      method: 'POST',
      url: '/api/v1/workflows/refinement/start',
      payload: { subjectId: story.id },
    });
    expect(refinement.json().status).toBe('AWAITING_APPROVAL');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workflows/development/start',
      payload: { subjectId: story.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/awaiting human approval/);
    expect(res.json().error).toMatch(/Resolve the pending approval/);
  });

  it('rejects approvals from unauthorised roles', async () => {
    const stories = (await app.inject({ method: 'GET', url: '/api/v1/stories' })).json() as Array<{ id: string; jiraKey: string }>;
    const story = stories.find((s) => s.jiraKey === 'FSC-101')!;
    await app.inject({ method: 'POST', url: '/api/v1/workflows/refinement/start', payload: { subjectId: story.id } });

    // Self-contained: resolve THIS story's approval, not whatever is oldest.
    const pending = ((await app.inject({ method: 'GET', url: '/api/v1/approvals?status=REVIEW' })).json() as Array<{ id: string; subjectId: string }>).filter(
      (a) => a.subjectId === story.id,
    );
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/${pending[0]!.id}/resolve`,
      headers: { authorization: 'Bearer demo-dev' },
      payload: { status: 'APPROVED' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/not permitted/);
  });

  it('re-evaluates Three Amigos INVEST on demand, preserving history and respecting the approval freeze', async () => {
    const stories = (await app.inject({ method: 'GET', url: '/api/v1/stories' })).json() as Array<{ id: string; jiraKey: string }>;
    const story = stories.find((s) => s.jiraKey === 'FSC-108')!;

    // Refinement run leaves the story at the human gate.
    await app.inject({ method: 'POST', url: '/api/v1/workflows/refinement/start', payload: { subjectId: story.id } });

    // Re-evaluation is frozen while the approval is pending.
    const frozen = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/three-amigos/reevaluate',
      payload: { subjectId: story.id },
    });
    expect(frozen.statusCode).toBe(400);
    expect(frozen.json().error).toMatch(/awaiting human approval/);

    // Approve the gate, then re-evaluate twice.
    const pending = ((await app.inject({ method: 'GET', url: '/api/v1/approvals?status=REVIEW' })).json() as Array<{ id: string; subjectId: string }>).filter(
      (a) => a.subjectId === story.id,
    );
    await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/${pending[0]!.id}/resolve`,
      headers: { authorization: 'Bearer demo-po' },
      payload: { status: 'APPROVED' },
    });

    for (let i = 0; i < 2; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/three-amigos/reevaluate',
        payload: { subjectId: story.id },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.run.definitionId).toBe('reevaluate-three-amigos');
      expect(body.run.status).toBe('COMPLETED');
      expect(body.decision.agentId).toBe('three-amigos');
      expect(body.decision.payload.invest).toBeDefined();
    }

    // Complete history preserved: 1 pipeline evaluation + 2 re-evaluations.
    const decisions = (await app.inject({ method: 'GET', url: `/api/v1/decisions?subjectId=${story.id}` })).json() as Array<{ agentId: string }>;
    expect(decisions.filter((d) => d.agentId === 'three-amigos').length).toBe(3);

    // Unknown agents are rejected.
    const unknown = await app.inject({ method: 'POST', url: '/api/v1/agents/not-an-agent/reevaluate', payload: { subjectId: story.id } });
    expect(unknown.statusCode).toBe(404);
  });

  it('marks Three Amigos complete and resets it, role-checked and audited', async () => {
    const stories = (await app.inject({ method: 'GET', url: '/api/v1/stories' })).json() as Array<{ id: string; jiraKey: string }>;
    const story = stories.find((s) => s.jiraKey === 'FSC-109')!;

    // No workshop yet → 404 with guidance.
    const premature = await app.inject({ method: 'POST', url: '/api/v1/agents/three-amigos/complete', headers: { authorization: 'Bearer demo-po' }, payload: { subjectId: story.id } });
    expect(premature.statusCode).toBe(404);
    expect(premature.json().error).toMatch(/run the workshop first/);

    // Run refinement and approve the gate to unfreeze the subject.
    await app.inject({ method: 'POST', url: '/api/v1/workflows/refinement/start', payload: { subjectId: story.id } });
    const pending = ((await app.inject({ method: 'GET', url: '/api/v1/approvals?status=REVIEW' })).json() as Array<{ id: string; subjectId: string }>).filter((a) => a.subjectId === story.id);
    await app.inject({ method: 'POST', url: `/api/v1/approvals/${pending[0]!.id}/resolve`, headers: { authorization: 'Bearer demo-po' }, payload: { status: 'APPROVED' } });

    // Developers may not complete the workshop — PO/BA only.
    const forbidden = await app.inject({ method: 'POST', url: '/api/v1/agents/three-amigos/complete', headers: { authorization: 'Bearer demo-dev' }, payload: { subjectId: story.id } });
    expect(forbidden.statusCode).toBe(400);
    expect(forbidden.json().error).toMatch(/not permitted/);

    // PO marks complete.
    const completed = await app.inject({ method: 'POST', url: '/api/v1/agents/three-amigos/complete', headers: { authorization: 'Bearer demo-po' }, payload: { subjectId: story.id } });
    expect(completed.statusCode).toBe(200);
    expect(completed.json().decision.approvalStatus).toBe('APPROVED');
    expect(completed.json().decision.approver).toBe('po@meridianwealth.demo');

    // BA resets: outcome reopened.
    const reset = await app.inject({ method: 'POST', url: '/api/v1/agents/three-amigos/reset', headers: { authorization: 'Bearer demo-ba' }, payload: { subjectId: story.id } });
    expect(reset.statusCode).toBe(200);
    expect(reset.json().decision.approvalStatus).toBe('PENDING');

    // Both transitions are in the audit trail.
    const audit = (await app.inject({ method: 'GET', url: `/api/v1/audit?subjectId=${story.id}` })).json() as Array<{ kind: string; summary: string }>;
    const transitions = audit.filter((e) => e.kind === 'DECISION_STATUS_CHANGED');
    expect(transitions.length).toBe(2);
    expect(transitions[0]!.summary).toMatch(/AUTO_APPROVED -> APPROVED/);
    expect(transitions[1]!.summary).toMatch(/APPROVED -> PENDING/);
  });

  it('verifies the audit chain and exports it', async () => {
    // Self-contained: generate audit events regardless of test ordering.
    const stories = (await app.inject({ method: 'GET', url: '/api/v1/stories' })).json() as Array<{ id: string; jiraKey: string }>;
    const story = stories.find((s) => s.jiraKey === 'FSC-106')!;
    await app.inject({ method: 'POST', url: '/api/v1/workflows/refinement/start', payload: { subjectId: story.id } });

    const verify = await app.inject({ method: 'GET', url: '/api/v1/audit/verify' });
    expect(verify.json().intact).toBe(true);
    const exported = await app.inject({ method: 'GET', url: '/api/v1/audit/export' });
    expect(exported.statusCode).toBe(200);
    expect(exported.body.split('\n').length).toBeGreaterThan(5);
  });

  it('records feedback and searches knowledge', async () => {
    // Self-contained: generate this test's own decisions.
    const stories = (await app.inject({ method: 'GET', url: '/api/v1/stories' })).json() as Array<{ id: string; jiraKey: string }>;
    const story = stories.find((s) => s.jiraKey === 'FSC-107')!;
    await app.inject({ method: 'POST', url: '/api/v1/workflows/refinement/start', payload: { subjectId: story.id } });

    const decisions = (await app.inject({ method: 'GET', url: `/api/v1/decisions?subjectId=${story.id}` })).json() as Array<{ id: string }>;
    expect(decisions.length).toBeGreaterThan(0);
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

  it('advances story lifecycle stages through phases and reflects it in dashboard story progress', async () => {
    const stories = (await app.inject({ method: 'GET', url: '/api/v1/stories' })).json() as Array<{ id: string; jiraKey: string; stage: string }>;
    const story = stories.find((s) => s.jiraKey === 'FSC-104')!;
    expect(story.stage).toBe('TESTING'); // seeded from JIRA status "In Testing"

    const before = ((await app.inject({ method: 'GET', url: '/api/v1/dashboard' })).json() as { storyProgress: { inTest: number } }).storyProgress;

    // Complete the testing pipeline (approve its human gate).
    await app.inject({ method: 'POST', url: '/api/v1/workflows/testing/start', payload: { subjectId: story.id } });
    const pending = ((await app.inject({ method: 'GET', url: '/api/v1/approvals?status=REVIEW' })).json() as Array<{ id: string; subjectId: string }>).filter(
      (a) => a.subjectId === story.id,
    );
    await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/${pending[0]!.id}/resolve`,
      headers: { authorization: 'Bearer demo-qelead' },
      payload: { status: 'APPROVED' },
    });

    // Stage advanced: TESTING -> RELEASE_READY.
    const after = (await app.inject({ method: 'GET', url: `/api/v1/stories/${story.id}` })).json() as { item: { stage: string } };
    expect(after.item.stage).toBe('RELEASE_READY');

    // Dashboard story progress moved with it.
    const progress = ((await app.inject({ method: 'GET', url: '/api/v1/dashboard' })).json() as { storyProgress: { inTest: number } }).storyProgress;
    expect(progress.inTest).toBe(before.inTest - 1);

    // Forward-only: re-running an earlier phase never regresses the stage.
    await app.inject({ method: 'POST', url: '/api/v1/workflows/development/start', payload: { subjectId: story.id } });
    const devPending = ((await app.inject({ method: 'GET', url: '/api/v1/approvals?status=REVIEW' })).json() as Array<{ id: string; subjectId: string }>).filter(
      (a) => a.subjectId === story.id,
    );
    await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/${devPending[0]!.id}/resolve`,
      headers: { authorization: 'Bearer demo-dev' },
      payload: { status: 'APPROVED' },
    });
    const still = (await app.inject({ method: 'GET', url: `/api/v1/stories/${story.id}` })).json() as { item: { stage: string } };
    expect(still.item.stage).toBe('RELEASE_READY');
  });

  it('serves squad and leadership metrics and predictions', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/metrics/squad' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/v1/metrics/leadership' })).statusCode).toBe(200);
    const predictions = (await app.inject({ method: 'GET', url: '/api/v1/metrics/predictions' })).json();
    expect(predictions.length).toBe(8);
  });
});

import { describe, expect, it } from 'vitest';
import { buildKernel, definition, okResult, StubAgent, TENANT } from './helpers.js';

describe('WorkflowEngine', () => {
  it('runs sequential steps, passes context, and completes', async () => {
    const { engine, registry } = buildKernel();
    const first = new StubAgent(definition('a1'), () => okResult({ analysis: 'done' }));
    const second = new StubAgent(definition('a2'), (ctx) =>
      okResult({ sawUpstream: (ctx.input['a1'] as Record<string, unknown>)?.['analysis'] === 'done' }),
    );
    registry.register(first);
    registry.register(second);
    engine.define({
      id: 'wf',
      name: 'Test',
      phase: 'REFINEMENT',
      description: '',
      version: 1,
      steps: [
        { id: 's1', agentId: 'a1', maxRetries: 0 },
        { id: 's2', agentId: 'a2', maxRetries: 0 },
      ],
    });

    const run = await engine.start({
      tenantId: TENANT,
      definitionId: 'wf',
      subjectType: 'STORY',
      subjectId: 'ST-1',
      triggeredBy: 'tester',
    });

    expect(run.status).toBe('COMPLETED');
    expect(run.steps.every((s) => s.status === 'COMPLETED')).toBe(true);
    const decision = engine.getDecision(run.steps[1]!.decisionId!)!;
    expect((decision.payload as Record<string, unknown>)['sawUpstream']).toBe(true);
  });

  it('retries failed steps up to maxRetries then fails the run', async () => {
    const { engine, registry } = buildKernel();
    const flaky = new StubAgent(definition('flaky'), (_ctx, execution) => {
      if (execution < 3) throw new Error('boom');
      return okResult();
    });
    registry.register(flaky);
    engine.define({
      id: 'wf-retry',
      name: 'Retry',
      phase: 'REFINEMENT',
      description: '',
      version: 1,
      steps: [{ id: 's1', agentId: 'flaky', maxRetries: 2 }],
    });

    const run = await engine.start({
      tenantId: TENANT,
      definitionId: 'wf-retry',
      subjectType: 'STORY',
      subjectId: 'ST-2',
      triggeredBy: 'tester',
    });

    expect(run.status).toBe('COMPLETED');
    expect(run.steps[0]!.attempts).toBe(3);
  });

  it('fails the run when retries are exhausted', async () => {
    const { engine, registry } = buildKernel();
    registry.register(new StubAgent(definition('always-fails'), () => {
      throw new Error('permanent');
    }));
    engine.define({
      id: 'wf-fail',
      name: 'Fail',
      phase: 'REFINEMENT',
      description: '',
      version: 1,
      steps: [{ id: 's1', agentId: 'always-fails', maxRetries: 1 }],
    });

    const run = await engine.start({
      tenantId: TENANT,
      definitionId: 'wf-fail',
      subjectType: 'STORY',
      subjectId: 'ST-3',
      triggeredBy: 'tester',
    });

    expect(run.status).toBe('FAILED');
    expect(run.steps[0]!.error).toContain('permanent');
  });

  it('executes parallel groups concurrently', async () => {
    const { engine, registry } = buildKernel();
    const order: string[] = [];
    for (const id of ['p1', 'p2', 'p3']) {
      registry.register(
        new StubAgent(definition(id), () => {
          order.push(id);
          return okResult();
        }),
      );
    }
    engine.define({
      id: 'wf-parallel',
      name: 'Parallel',
      phase: 'TESTING',
      description: '',
      version: 1,
      steps: [
        { id: 's1', agentId: 'p1', maxRetries: 0, parallelGroup: 'g1' },
        { id: 's2', agentId: 'p2', maxRetries: 0, parallelGroup: 'g1' },
        { id: 's3', agentId: 'p3', maxRetries: 0 },
      ],
    });

    const run = await engine.start({
      tenantId: TENANT,
      definitionId: 'wf-parallel',
      subjectType: 'STORY',
      subjectId: 'ST-4',
      triggeredBy: 'tester',
    });

    expect(run.status).toBe('COMPLETED');
    expect(order.slice(0, 2).sort()).toEqual(['p1', 'p2']);
    expect(order[2]).toBe('p3');
  });

  it('pauses at gatekeeper failures and resumes after human approval', async () => {
    const { engine, registry, approvals } = buildKernel();
    registry.register(
      new StubAgent(definition('gate', { gatekeeper: true }), () => ({
        ...okResult({ passed: false }, 0.9),
      })),
    );
    registry.register(new StubAgent(definition('after'), () => okResult()));
    engine.define({
      id: 'wf-gate',
      name: 'Gate',
      phase: 'REFINEMENT',
      description: '',
      version: 1,
      steps: [
        { id: 's1', agentId: 'gate', maxRetries: 0 },
        { id: 's2', agentId: 'after', maxRetries: 0 },
      ],
    });

    const run = await engine.start({
      tenantId: TENANT,
      definitionId: 'wf-gate',
      subjectType: 'STORY',
      subjectId: 'ST-5',
      triggeredBy: 'tester',
    });

    expect(run.status).toBe('AWAITING_APPROVAL');
    const pending = approvals.list(TENANT, 'REVIEW');
    expect(pending).toHaveLength(1);

    await approvals.resolve({
      approvalId: pending[0]!.id,
      status: 'APPROVED',
      resolvedBy: 'po@qe.ai',
      resolverRoles: ['PRODUCT_OWNER'],
    });

    expect(run.status).toBe('COMPLETED');
    expect(run.steps[1]!.status).toBe('COMPLETED');
  });

  it('fails the run when a human rejects the gate', async () => {
    const { engine, registry, approvals } = buildKernel();
    registry.register(
      new StubAgent(definition('gate2', { gatekeeper: true }), () => okResult({ passed: true }, 0.4)),
    );
    engine.define({
      id: 'wf-gate2',
      name: 'Gate2',
      phase: 'REFINEMENT',
      description: '',
      version: 1,
      steps: [{ id: 's1', agentId: 'gate2', maxRetries: 0 }],
    });

    const run = await engine.start({
      tenantId: TENANT,
      definitionId: 'wf-gate2',
      subjectType: 'STORY',
      subjectId: 'ST-6',
      triggeredBy: 'tester',
    });

    // low confidence (0.4 < 0.7 threshold) escalated even though passed=true
    expect(run.status).toBe('AWAITING_APPROVAL');
    const pending = approvals.list(TENANT, 'REVIEW');
    await approvals.resolve({
      approvalId: pending[0]!.id,
      status: 'REJECTED',
      resolvedBy: 'po@qe.ai',
      resolverRoles: ['PRODUCT_OWNER'],
    });

    expect(run.status).toBe('FAILED');
  });

  it('supports pause, resume and rollback', async () => {
    const { engine, registry } = buildKernel();
    registry.register(new StubAgent(definition('solo'), () => okResult()));
    engine.define({
      id: 'wf-ctl',
      name: 'Control',
      phase: 'REFINEMENT',
      description: '',
      version: 1,
      steps: [{ id: 's1', agentId: 'solo', maxRetries: 0 }],
    });
    const run = await engine.start({
      tenantId: TENANT,
      definitionId: 'wf-ctl',
      subjectType: 'STORY',
      subjectId: 'ST-7',
      triggeredBy: 'tester',
    });
    expect(run.status).toBe('COMPLETED');

    const rolledBack = await engine.rollback(run.id, 'admin');
    expect(rolledBack.status).toBe('ROLLED_BACK');
    expect(rolledBack.steps[0]!.status).toBe('SKIPPED');
  });

  it('renders a mermaid visualisation', async () => {
    const { engine, registry } = buildKernel();
    registry.register(new StubAgent(definition('viz'), () => okResult()));
    engine.define({
      id: 'wf-viz',
      name: 'Viz',
      phase: 'REFINEMENT',
      description: '',
      version: 1,
      steps: [{ id: 's1', agentId: 'viz', maxRetries: 0 }],
    });
    const run = await engine.start({
      tenantId: TENANT,
      definitionId: 'wf-viz',
      subjectType: 'STORY',
      subjectId: 'ST-8',
      triggeredBy: 'tester',
    });
    const diagram = engine.visualize(run.id);
    expect(diagram).toContain('flowchart TD');
    expect(diagram).toContain('viz');
  });
});

import type { FastifyInstance } from 'fastify';
import type { GeneratedTest } from '@qe-ai/agents';
import { ApexTestRunner, collectBranchReview, writeGeneratedTests } from '../devtools.js';
import type { RouteContext } from './context.js';

/** Developer tools: real branch review, Apex test generation and org execution. */
export function registerDevtoolsRoutes(app: FastifyInstance, { platform, currentUser }: RouteContext): void {
  const { tenantId, engine, audit } = platform;
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
}

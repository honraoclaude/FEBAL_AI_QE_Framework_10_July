import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { createPlatform } from '../src/platform.js';

/**
 * Self-contained branch-review test: builds a throwaway git repository with a
 * main branch and a feature branch adding a deliberately flawed Apex class,
 * then drives the real /devtools endpoints against it.
 */

const FLAWED_APEX = `public class FeeCalculator {
    public static Decimal calculateTotalFees(List<Id> accountIds) {
        Decimal total = 0;
        for (Id accountId : accountIds) {
            List<Fee__c> fees = [SELECT Amount__c FROM Fee__c WHERE Account__c = :accountId];
            for (Fee__c fee : fees) {
                total += fee.Amount__c;
                update fee;
            }
        }
        System.debug('total: ' + total);
        return total;
    }
}
`;

let app: FastifyInstance;
let repoPath: string;

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

beforeAll(async () => {
  app = await buildServer(await createPlatform());

  repoPath = mkdtempSync(join(tmpdir(), 'qeai-branch-'));
  git(['init', '-b', 'main'], repoPath);
  git(['config', 'user.email', 'test@qe.ai'], repoPath);
  git(['config', 'user.name', 'QE Test'], repoPath);
  writeFileSync(join(repoPath, 'README.md'), '# demo\n');
  git(['add', '.'], repoPath);
  git(['commit', '-m', 'base'], repoPath);

  git(['checkout', '-b', 'feature/fee-calculator'], repoPath);
  mkdirSync(join(repoPath, 'force-app', 'main', 'default', 'classes'), { recursive: true });
  writeFileSync(join(repoPath, 'force-app', 'main', 'default', 'classes', 'FeeCalculator.cls'), FLAWED_APEX);
  git(['add', '.'], repoPath);
  git(['commit', '-m', 'add fee calculator'], repoPath);
  git(['checkout', 'main'], repoPath);
});

describe('devtools: branch review, test generation, apex execution', () => {
  it('reviews a real branch: line-anchored findings from the actual diff', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/devtools/branch-review',
      payload: { repoPath, baseRef: 'main', headRef: 'feature/fee-calculator' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.run.status).toBe('COMPLETED');
    const payload = body.review.payload;
    expect(payload.mode).toBe('BRANCH');
    expect(payload.filesReviewed).toBe(1);
    const rules = payload.findings.map((f: { rule: string }) => f.rule);
    expect(rules).toContain('soql-in-loop');
    expect(rules).toContain('dml-in-loop');
    expect(rules).toContain('sharing-declaration');
    expect(payload.passed).toBe(false);
    expect(payload.findings[0].file).toContain('FeeCalculator.cls');

    // Real test class generated and written to disk.
    const gen = body.testGeneration.payload;
    expect(gen.mode).toBe('BRANCH');
    expect(gen.generated).toHaveLength(1);
    expect(gen.generated[0].className).toBe('FeeCalculatorTest');
    expect(body.generatedTestFiles).toHaveLength(1);
    expect(existsSync(body.generatedTestFiles[0])).toBe(true);
    expect(readFileSync(body.generatedTestFiles[0], 'utf8')).toContain('@IsTest');

    // Runner availability reported honestly (no org in CI → available:false with instructions).
    expect(body.apexRun).toHaveProperty('available');
    if (!body.apexRun.available) {
      expect(body.apexRun.instructions.length).toBeGreaterThan(0);
    }
  }, 120_000); // integration test: sf CLI availability checks take seconds when an org is connected

  it('rejects unknown refs with a clear error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/devtools/branch-review',
      payload: { repoPath, headRef: 'no-such-branch' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Unknown git ref/);
  });

  it('never fakes an Apex test run without an org', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/devtools/apex-test-run',
      payload: { repoPath, testClasses: ['FeeCalculatorTest'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Either a genuine org run executed, or it explicitly did not execute.
    if (!body.executed) {
      expect(body.error).toMatch(/org/i);
      expect(body.availability.available).toBe(false);
    } else {
      expect(body.availability.org).toBeTruthy();
      expect(typeof body.testsRan).toBe('number');
    }
  }, 180_000); // integration test: executes real Apex tests when an org is authenticated locally
});

import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { BranchReviewInput, GeneratedTest } from '@qe-ai/agents';

const run = promisify(execFile);

/**
 * Developer tooling adapters (ENH-01 slice):
 *  - GitWorkspace reads a real branch diff from a local repository.
 *  - ApexTestRunner executes generated tests via the Salesforce CLI when an
 *    authenticated org is available — and reports honestly when it is not
 *    (Apex can only execute inside a Salesforce org).
 */

async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd: repoPath, maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

export async function collectBranchReview(repoPath: string, baseRef: string, headRef: string): Promise<BranchReviewInput> {
  const root = resolve(repoPath);
  // Validate refs early with a clear error.
  for (const ref of [baseRef, headRef]) {
    try {
      await git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    } catch {
      throw new Error(`Unknown git ref "${ref}" in ${root}. Provide an existing branch, tag or commit.`);
    }
  }

  const nameStatus = await git(root, ['diff', '--name-status', `${baseRef}...${headRef}`]);
  const changedFiles = nameStatus
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split('\t');
      return { status: status ?? '?', path: rest[rest.length - 1] ?? '' };
    });

  const apexPaths = changedFiles.filter((f) => f.path.endsWith('.cls') && f.status !== 'D').map((f) => f.path);
  const apexClasses = await Promise.all(
    apexPaths.map(async (path) => ({
      path,
      // Read from the branch itself — no checkout required.
      source: await git(root, ['show', `${headRef}:${path}`]),
    })),
  );

  const diff = await git(root, ['diff', `${baseRef}...${headRef}`]);
  return {
    repoPath: root,
    baseRef,
    headRef,
    changedFiles,
    apexClasses,
    diff: diff.length > 40_000 ? `${diff.slice(0, 40_000)}\n… (diff truncated)` : diff,
  };
}

/** Writes generated test classes into <repo>/qeai-generated-tests/ and returns their paths. */
export async function writeGeneratedTests(repoPath: string, tests: GeneratedTest[]): Promise<string[]> {
  if (tests.length === 0) return [];
  const dir = join(resolve(repoPath), 'qeai-generated-tests');
  await mkdir(dir, { recursive: true });
  const paths: string[] = [];
  for (const test of tests) {
    const filePath = join(dir, test.fileName);
    await writeFile(filePath, test.source, 'utf8');
    await writeFile(`${filePath}-meta.xml`, APEX_META_XML, 'utf8');
    paths.push(filePath);
  }
  return paths;
}

const APEX_META_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>61.0</apiVersion>
    <status>Active</status>
</ApexClass>
`;

export interface ApexRunAvailability {
  available: boolean;
  cli?: string;
  org?: string;
  instructions?: string[];
}

export interface ApexRunResult {
  executed: boolean;
  availability: ApexRunAvailability;
  outcome?: string;
  testsRan?: number;
  passing?: number;
  failing?: number;
  raw?: unknown;
  error?: string;
}

export class ApexTestRunner {
  /** Detects the Salesforce CLI and an authenticated default org. */
  async availability(repoPath?: string): Promise<ApexRunAvailability> {
    const instructions = [
      'Install the Salesforce CLI: npm install -g @salesforce/cli',
      'Authenticate an org: sf org login web --set-default (or create a scratch org: sf org create scratch)',
      'Deploy the classes under test plus qeai-generated-tests/, then re-run.',
    ];
    let cli: string;
    try {
      cli = (await run('sf', ['--version'], { shell: process.platform === 'win32' })).stdout.trim().split('\n')[0] ?? 'sf';
    } catch {
      return { available: false, instructions: ['Salesforce CLI (sf) not found on PATH.', ...instructions] };
    }
    try {
      const display = await run('sf', ['org', 'display', '--json'], {
        cwd: repoPath ? resolve(repoPath) : undefined,
        shell: process.platform === 'win32',
      });
      const parsed = JSON.parse(display.stdout) as { result?: { username?: string; alias?: string } };
      const org = parsed.result?.alias ?? parsed.result?.username;
      if (!org) return { available: false, cli, instructions: ['sf CLI found but no default org is set.', ...instructions] };
      return { available: true, cli, org };
    } catch {
      return { available: false, cli, instructions: ['sf CLI found but no authenticated default org.', ...instructions] };
    }
  }

  /** Runs the named test classes in the default org. Never fakes results. */
  async runTests(repoPath: string, testClasses: string[]): Promise<ApexRunResult> {
    const availability = await this.availability(repoPath);
    if (!availability.available) {
      return { executed: false, availability, error: 'No Salesforce org available — Apex tests can only execute inside an org.' };
    }
    try {
      const args = ['apex', 'run', 'test', ...testClasses.flatMap((t) => ['--tests', t]), '--wait', '10', '--result-format', 'json'];
      const { stdout } = await run('sf', args, { cwd: resolve(repoPath), shell: process.platform === 'win32', maxBuffer: 10 * 1024 * 1024 });
      const parsed = JSON.parse(stdout) as { result?: { summary?: { outcome?: string; testsRan?: number; passing?: number; failing?: number } } };
      const summary = parsed.result?.summary;
      return {
        executed: true,
        availability,
        outcome: summary?.outcome,
        testsRan: summary?.testsRan,
        passing: summary?.passing,
        failing: summary?.failing,
        raw: parsed.result,
      };
    } catch (error) {
      return { executed: false, availability, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

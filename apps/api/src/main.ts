import { buildServer } from './server.js';
import { createPlatform } from './platform.js';

const port = Number(process.env['PORT'] ?? 4000);
const host = process.env['HOST'] ?? '0.0.0.0';

// Step pacing makes live-run streaming watchable in demo mode; a real LLM
// provider has natural latency, so pacing defaults off when a key is set.
const stepDelayMs = process.env['QEAI_STEP_DELAY_MS']
  ? Number(process.env['QEAI_STEP_DELAY_MS'])
  : process.env['ANTHROPIC_API_KEY']
    ? 0
    : 450;

const platform = await createPlatform({ stepDelayMs });
const app = await buildServer(platform);

await app.listen({ port, host });
console.log(`QE.ai API listening on http://${host}:${port} (tenant: ${platform.tenantId})`);
console.log(`LLM provider: ${process.env['ANTHROPIC_API_KEY'] ? 'anthropic' : 'simulated (set ANTHROPIC_API_KEY for live reasoning)'}`);

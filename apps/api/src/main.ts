import { buildServer } from './server.js';
import { createPlatform } from './platform.js';

const port = Number(process.env['PORT'] ?? 4000);
const host = process.env['HOST'] ?? '0.0.0.0';

const platform = await createPlatform();
const app = await buildServer(platform);

await app.listen({ port, host });
console.log(`QE.ai API listening on http://${host}:${port} (tenant: ${platform.tenantId})`);
console.log(`LLM provider: ${process.env['ANTHROPIC_API_KEY'] ? 'anthropic' : 'simulated (set ANTHROPIC_API_KEY for live reasoning)'}`);

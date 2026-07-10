import { sha256 } from './util.js';

/** LLM provider port. The kernel depends on this interface, never on a vendor SDK. */

export interface LlmRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
}

export interface LlmResponse {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

/**
 * Deterministic offline provider. Lets the entire platform run, demo and test
 * without network access or API keys. Agents compute their payloads with
 * domain heuristics; this provider supplies deterministic narrative text.
 */
export class SimulatedLlmProvider implements LlmProvider {
  readonly name = 'simulated';
  readonly model = 'simulated-qe-1';

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const seed = sha256(request.system + request.prompt).slice(0, 8);
    const text =
      `Simulated analysis (${seed}). ` +
      `Assessment generated deterministically from the request context so the platform is fully functional offline. ` +
      `Connect an Anthropic API key to enable live model reasoning.`;
    return {
      text,
      model: this.model,
      inputTokens: Math.ceil((request.system.length + request.prompt.length) / 4),
      outputTokens: Math.ceil(text.length / 4),
    };
  }
}

/** Anthropic Claude adapter. SDK is loaded lazily so offline deployments never import it. */
export class AnthropicLlmProvider implements LlmProvider {
  readonly name = 'anthropic';

  constructor(
    readonly model: string = 'claude-opus-4-8',
    private readonly apiKey: string | undefined = process.env['ANTHROPIC_API_KEY'],
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = this.apiKey ? new Anthropic({ apiKey: this.apiKey }) : new Anthropic();
    const response = await client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens ?? 4096,
      system: request.system,
      messages: [{ role: 'user', content: request.prompt }],
    });
    const text = response.content
      .filter((block): block is Extract<(typeof response.content)[number], { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    return {
      text,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}

export function createLlmProvider(kind: 'anthropic' | 'simulated', model?: string): LlmProvider {
  if (kind === 'anthropic' && process.env['ANTHROPIC_API_KEY']) {
    return new AnthropicLlmProvider(model);
  }
  return new SimulatedLlmProvider();
}

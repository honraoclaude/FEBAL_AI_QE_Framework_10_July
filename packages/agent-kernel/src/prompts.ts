/** Versioned prompt library. Every agent decision records the prompt version used. */

export interface PromptTemplate {
  id: string;
  version: string;
  description: string;
  system: string;
  /** Template body with {{placeholder}} interpolation. */
  template: string;
}

export class PromptLibrary {
  /** promptId -> version -> template */
  private prompts = new Map<string, Map<string, PromptTemplate>>();

  register(prompt: PromptTemplate): void {
    const versions = this.prompts.get(prompt.id) ?? new Map<string, PromptTemplate>();
    versions.set(prompt.version, prompt);
    this.prompts.set(prompt.id, versions);
  }

  /** Latest version wins by semver-ish string comparison of `major.minor`. */
  latest(promptId: string): PromptTemplate {
    const versions = this.prompts.get(promptId);
    if (!versions || versions.size === 0) {
      throw new Error(`Unknown prompt: ${promptId}`);
    }
    const sorted = [...versions.values()].sort((a, b) => compareVersions(a.version, b.version));
    return sorted[sorted.length - 1]!;
  }

  get(promptId: string, version: string): PromptTemplate | undefined {
    return this.prompts.get(promptId)?.get(version);
  }

  list(): PromptTemplate[] {
    return [...this.prompts.values()].flatMap((v) => [...v.values()]);
  }

  render(promptId: string, variables: Record<string, string>): { system: string; prompt: string; version: string } {
    const template = this.latest(promptId);
    let prompt = template.template;
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replaceAll(`{{${key}}}`, value);
    }
    return { system: template.system, prompt, version: template.version };
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

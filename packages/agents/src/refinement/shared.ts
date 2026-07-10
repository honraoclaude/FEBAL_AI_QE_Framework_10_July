import type { AgentDefinition } from '@qe-ai/contracts';
import type { AgentContext } from '@qe-ai/agent-kernel';
import { REFINEMENT_AGENTS } from '../catalog.js';

/** Shape of the story object placed in workflow context by the API layer. */
export interface StoryInput {
  id: string;
  jiraKey: string;
  title: string;
  description: string;
  storyPoints?: number;
  labels: string[];
  acceptanceCriteria: Array<{ id: string; text: string; testable: boolean }>;
}

export function getDef(id: string): AgentDefinition {
  const definition = REFINEMENT_AGENTS.find((d) => d.id === id);
  if (!definition) throw new Error(`Missing refinement definition: ${id}`);
  return definition;
}

export function storyFrom(context: AgentContext): StoryInput {
  const story = context.input['story'] as StoryInput | undefined;
  if (story) return story;
  return {
    id: context.subjectId,
    jiraKey: context.subjectId,
    title: context.subjectId,
    description: '',
    labels: [],
    acceptanceCriteria: [],
  };
}

export function text(story: StoryInput): string {
  return `${story.title} ${story.description} ${story.labels.join(' ')}`.toLowerCase();
}

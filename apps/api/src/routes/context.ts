import type { FastifyRequest } from 'fastify';
import type { User, WorkItem } from '@qe-ai/contracts';
import type { StoryInput } from '@qe-ai/agents';
import type { Platform } from '../platform.js';

/** Shared dependencies handed to every route module. */
export interface RouteContext {
  platform: Platform;
  currentUser: (request: FastifyRequest) => User;
}

/**
 * Demo auth: `Authorization: Bearer demo-<userId>` (see seed users);
 * unauthenticated requests act as the read-only demo viewer. Production
 * replaces this with OAuth2/OIDC + SAML at the gateway.
 */
export function createCurrentUser(platform: Platform): RouteContext['currentUser'] {
  return (request) => {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const user = platform.users.byToken(header.slice(7));
      if (user) return user;
    }
    return {
      id: 'viewer',
      tenantId: platform.tenantId,
      email: 'viewer@demo',
      displayName: 'Demo Viewer',
      roles: ['ADMIN'],
      active: true,
    };
  };
}

/** Maps a stored work item to the story shape agents consume. */
export function toStoryInput(item: WorkItem): StoryInput {
  return {
    id: item.id,
    jiraKey: item.jiraKey,
    title: item.title,
    description: item.description,
    storyPoints: item.storyPoints,
    labels: item.labels,
    acceptanceCriteria: item.acceptanceCriteria.map((ac) => ({ id: ac.id, text: ac.text, testable: ac.testable })),
  };
}

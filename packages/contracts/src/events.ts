import type { TenantId } from './tenancy.js';

/** Event-driven backbone: every state change publishes a platform event. */

export interface PlatformEvent<TPayload = unknown> {
  id: string;
  tenantId: TenantId;
  /** Dot-namespaced topic, e.g. `workflow.step.completed`, `approval.resolved`. */
  topic: string;
  payload: TPayload;
  source: string;
  correlationId?: string;
  occurredAt: string;
}

export type EventHandler = (event: PlatformEvent) => void | Promise<void>;

export interface EventSubscription {
  /** Exact topic or prefix wildcard, e.g. `workflow.*`. */
  pattern: string;
  handler: EventHandler;
}

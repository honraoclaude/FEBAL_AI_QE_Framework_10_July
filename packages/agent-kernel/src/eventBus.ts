import type { EventHandler, PlatformEvent } from '@qe-ai/contracts';
import { newId, nowIso } from './util.js';

/**
 * In-process event bus implementing the platform's event-driven backbone.
 * The interface is transport-agnostic: swap this for Kafka/NATS in production
 * by re-implementing `publish`/`subscribe` against the broker.
 */
export class EventBus {
  private subscriptions: Array<{ pattern: string; handler: EventHandler }> = [];
  private history: PlatformEvent[] = [];
  private readonly maxHistory = 5000;

  subscribe(pattern: string, handler: EventHandler): () => void {
    const sub = { pattern, handler };
    this.subscriptions.push(sub);
    return () => {
      this.subscriptions = this.subscriptions.filter((s) => s !== sub);
    };
  }

  async publish<T>(tenantId: string, topic: string, payload: T, source: string, correlationId?: string): Promise<PlatformEvent<T>> {
    const event: PlatformEvent<T> = {
      id: newId('evt'),
      tenantId,
      topic,
      payload,
      source,
      correlationId,
      occurredAt: nowIso(),
    };
    this.history.push(event);
    if (this.history.length > this.maxHistory) this.history.shift();

    for (const sub of this.subscriptions) {
      if (this.matches(sub.pattern, topic)) {
        // Handlers must not break the publisher; failures are isolated.
        try {
          await sub.handler(event);
        } catch {
          /* handler errors are swallowed by design; observability hooks live in handlers */
        }
      }
    }
    return event;
  }

  recent(tenantId: string, limit = 100): PlatformEvent[] {
    return this.history.filter((e) => e.tenantId === tenantId).slice(-limit);
  }

  private matches(pattern: string, topic: string): boolean {
    if (pattern === '*' || pattern === topic) return true;
    if (pattern.endsWith('*')) return topic.startsWith(pattern.slice(0, -1));
    return false;
  }
}

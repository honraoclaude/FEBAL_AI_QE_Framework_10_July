import type { AuditEvent, AuditEventKind } from '@qe-ai/contracts';
import { canonicalJson, newId, nowIso, sha256 } from './util.js';

export interface AuditEntryInput {
  tenantId: string;
  kind: AuditEventKind;
  actor: string;
  summary: string;
  detail?: Record<string, unknown>;
  workflowRunId?: string;
  agentId?: string;
  decisionId?: string;
  promptVersion?: string;
  llmVersion?: string;
  knowledgeVersion?: string;
  subjectType?: string;
  subjectId?: string;
}

/**
 * Append-only, hash-chained audit trail. Each event's hash covers the previous
 * hash plus the canonical event body, making tampering detectable.
 */
export class AuditTrail {
  private events: AuditEvent[] = [];
  private lastHashByTenant = new Map<string, string>();
  private seqByTenant = new Map<string, number>();

  record(input: AuditEntryInput): AuditEvent {
    const previousHash = this.lastHashByTenant.get(input.tenantId) ?? 'GENESIS';
    const seq = (this.seqByTenant.get(input.tenantId) ?? 0) + 1;
    const body = {
      ...input,
      detail: input.detail ?? {},
      id: newId('aud'),
      seq,
      timestamp: nowIso(),
    };
    const hash = sha256(previousHash + canonicalJson(body));
    const event: AuditEvent = { ...body, hash, previousHash };
    this.events.push(event);
    this.lastHashByTenant.set(input.tenantId, hash);
    this.seqByTenant.set(input.tenantId, seq);
    return event;
  }

  query(tenantId: string, filter?: { kind?: AuditEventKind; subjectId?: string; limit?: number }): AuditEvent[] {
    let results = this.events.filter((e) => e.tenantId === tenantId);
    if (filter?.kind) results = results.filter((e) => e.kind === filter.kind);
    if (filter?.subjectId) results = results.filter((e) => e.subjectId === filter.subjectId);
    return results.slice(-(filter?.limit ?? 200));
  }

  /** Recompute the hash chain; returns the first broken sequence number, or null when intact. */
  verifyChain(tenantId: string): number | null {
    let previousHash = 'GENESIS';
    for (const event of this.events.filter((e) => e.tenantId === tenantId)) {
      const { hash, previousHash: recordedPrev, ...body } = event;
      if (recordedPrev !== previousHash) return event.seq;
      if (sha256(previousHash + canonicalJson(body)) !== hash) return event.seq;
      previousHash = hash;
    }
    return null;
  }

  /** Compliance export: full trail as JSON lines. */
  export(tenantId: string): string {
    return this.events
      .filter((e) => e.tenantId === tenantId)
      .map((e) => JSON.stringify(e))
      .join('\n');
  }
}

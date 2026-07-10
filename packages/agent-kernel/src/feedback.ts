import type { DecisionFeedback } from '@qe-ai/contracts';
import type { AuditTrail } from './audit.js';
import type { MemoryStore } from './memory.js';
import { newId, nowIso } from './util.js';

/**
 * Feedback loop: every accepted/rejected/modified recommendation is recorded,
 * audited, and fed into long-term memory so future retrieval sees the outcome.
 */
export class FeedbackService {
  private feedback: DecisionFeedback[] = [];

  constructor(
    private readonly audit: AuditTrail,
    private readonly memory: MemoryStore,
  ) {}

  record(input: Omit<DecisionFeedback, 'id' | 'createdAt'>): DecisionFeedback {
    const entry: DecisionFeedback = { ...input, id: newId('fbk'), createdAt: nowIso() };
    this.feedback.push(entry);

    this.audit.record({
      tenantId: entry.tenantId,
      kind: 'FEEDBACK_RECORDED',
      actor: entry.reviewerId,
      summary: `Feedback on decision ${entry.decisionId}: ${entry.outcome}`,
      decisionId: entry.decisionId,
      detail: { comments: entry.reviewerComments, learningOutcome: entry.learningOutcome },
    });

    this.memory.ingest({
      tenantId: entry.tenantId,
      source: 'INTERNAL_STANDARD',
      title: `Reviewer feedback (${entry.outcome}) on decision ${entry.decisionId}`,
      content: `${entry.outcome}: ${entry.reviewerComments ?? ''} ${entry.learningOutcome ?? ''}`.trim(),
      tags: ['feedback', entry.outcome.toLowerCase()],
    });
    return entry;
  }

  list(tenantId: string): DecisionFeedback[] {
    return this.feedback.filter((f) => f.tenantId === tenantId);
  }

  acceptanceRate(tenantId: string): number {
    const entries = this.list(tenantId);
    if (entries.length === 0) return 1;
    return entries.filter((f) => f.outcome === 'ACCEPTED').length / entries.length;
  }
}

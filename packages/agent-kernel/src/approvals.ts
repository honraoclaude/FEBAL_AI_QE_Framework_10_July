import type {
  ApprovalMatrix,
  ApprovalRequest,
  ApprovalStatus,
  ApprovalType,
  Role,
} from '@qe-ai/contracts';
import { DEFAULT_APPROVAL_MATRIX } from '@qe-ai/contracts';
import type { AuditTrail } from './audit.js';
import type { EventBus } from './eventBus.js';
import { newId, nowIso } from './util.js';

const RESOLVED: ApprovalStatus[] = ['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'];

const TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
  DRAFT: ['REVIEW', 'CANCELLED'],
  REVIEW: ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'CANCELLED', 'EXPIRED'],
  CHANGES_REQUESTED: ['REVIEW', 'CANCELLED', 'EXPIRED'],
  APPROVED: ['REOPENED'],
  REJECTED: ['REOPENED'],
  REOPENED: ['REVIEW', 'CANCELLED'],
  CANCELLED: [],
  EXPIRED: ['REOPENED'],
};

export class ApprovalService {
  private requests = new Map<string, ApprovalRequest>();

  constructor(
    private readonly bus: EventBus,
    private readonly audit: AuditTrail,
    private matrix: ApprovalMatrix = DEFAULT_APPROVAL_MATRIX,
  ) {}

  configureMatrix(matrix: ApprovalMatrix): void {
    this.matrix = matrix;
  }

  getMatrix(): ApprovalMatrix {
    return this.matrix;
  }

  async request(input: {
    tenantId: string;
    type: ApprovalType;
    title: string;
    subjectType: ApprovalRequest['subjectType'];
    subjectId: string;
    requestedBy: string;
    decisionId?: string;
    workflowRunId?: string;
    expiresInHours?: number;
  }): Promise<ApprovalRequest> {
    const request: ApprovalRequest = {
      id: newId('apr'),
      tenantId: input.tenantId,
      type: input.type,
      title: input.title,
      status: 'REVIEW',
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      decisionId: input.decisionId,
      workflowRunId: input.workflowRunId,
      requiredRoles: this.matrix[input.type],
      requestedBy: input.requestedBy,
      comments: [],
      createdAt: nowIso(),
      expiresAt: input.expiresInHours
        ? new Date(Date.now() + input.expiresInHours * 3_600_000).toISOString()
        : undefined,
    };
    this.requests.set(request.id, request);
    this.audit.record({
      tenantId: input.tenantId,
      kind: 'APPROVAL_REQUESTED',
      actor: input.requestedBy,
      summary: `Approval requested: ${input.title}`,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      decisionId: input.decisionId,
      workflowRunId: input.workflowRunId,
      detail: { approvalId: request.id, type: input.type, requiredRoles: request.requiredRoles },
    });
    await this.bus.publish(input.tenantId, 'approval.requested', { approvalId: request.id, type: input.type }, 'approval-service');
    return request;
  }

  async resolve(input: {
    approvalId: string;
    status: ApprovalStatus;
    resolvedBy: string;
    resolverRoles: Role[];
    comment?: string;
  }): Promise<ApprovalRequest> {
    const request = this.requests.get(input.approvalId);
    if (!request) throw new Error(`Unknown approval: ${input.approvalId}`);
    if (!TRANSITIONS[request.status].includes(input.status)) {
      throw new Error(`Invalid transition ${request.status} -> ${input.status}`);
    }
    const decisive = input.status === 'APPROVED' || input.status === 'REJECTED';
    if (decisive) {
      const allowed = request.requiredRoles.some((role) => input.resolverRoles.includes(role)) || input.resolverRoles.includes('ADMIN');
      if (!allowed) {
        throw new Error(`Roles [${input.resolverRoles.join(', ')}] are not permitted to resolve ${request.type} approvals`);
      }
    }

    request.status = input.status;
    if (RESOLVED.includes(input.status)) {
      request.resolvedBy = input.resolvedBy;
      request.resolvedAt = nowIso();
    }
    if (input.comment) {
      request.comments.push({ authorId: input.resolvedBy, text: input.comment, createdAt: nowIso() });
    }

    this.audit.record({
      tenantId: request.tenantId,
      kind: 'APPROVAL_RESOLVED',
      actor: input.resolvedBy,
      summary: `Approval ${request.title} -> ${input.status}`,
      subjectType: request.subjectType,
      subjectId: request.subjectId,
      decisionId: request.decisionId,
      workflowRunId: request.workflowRunId,
      detail: { approvalId: request.id, status: input.status, comment: input.comment },
    });
    await this.bus.publish(request.tenantId, 'approval.resolved', { approvalId: request.id, status: input.status }, 'approval-service');
    return request;
  }

  get(approvalId: string): ApprovalRequest | undefined {
    return this.requests.get(approvalId);
  }

  list(tenantId: string, status?: ApprovalStatus): ApprovalRequest[] {
    let results = [...this.requests.values()].filter((r) => r.tenantId === tenantId);
    if (status) results = results.filter((r) => r.status === status);
    return results;
  }

  pendingCount(tenantId: string): number {
    return this.list(tenantId).filter((r) => r.status === 'REVIEW' || r.status === 'CHANGES_REQUESTED').length;
  }
}

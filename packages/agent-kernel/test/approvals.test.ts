import { describe, expect, it } from 'vitest';
import { buildKernel, TENANT } from './helpers.js';

describe('ApprovalService', () => {
  it('enforces the role-based approval matrix', async () => {
    const { approvals } = buildKernel();
    const request = await approvals.request({
      tenantId: TENANT,
      type: 'SECURITY',
      title: 'Security review',
      subjectType: 'STORY',
      subjectId: 'ST-1',
      requestedBy: 'secure-coding-agent',
    });

    await expect(
      approvals.resolve({
        approvalId: request.id,
        status: 'APPROVED',
        resolvedBy: 'dev@qe.ai',
        resolverRoles: ['DEVELOPER'],
      }),
    ).rejects.toThrow(/not permitted/);

    const resolved = await approvals.resolve({
      approvalId: request.id,
      status: 'APPROVED',
      resolvedBy: 'sec@qe.ai',
      resolverRoles: ['SECURITY_LEAD'],
    });
    expect(resolved.status).toBe('APPROVED');
    expect(resolved.resolvedBy).toBe('sec@qe.ai');
  });

  it('enforces valid status transitions', async () => {
    const { approvals } = buildKernel();
    const request = await approvals.request({
      tenantId: TENANT,
      type: 'BDD',
      title: 'BDD sign-off',
      subjectType: 'STORY',
      subjectId: 'ST-2',
      requestedBy: 'bdd-designer',
    });

    await approvals.resolve({
      approvalId: request.id,
      status: 'CHANGES_REQUESTED',
      resolvedBy: 'qa@qe.ai',
      resolverRoles: ['QA_ENGINEER'],
      comment: 'Add negative scenarios',
    });
    expect(approvals.get(request.id)!.status).toBe('CHANGES_REQUESTED');
    expect(approvals.get(request.id)!.comments).toHaveLength(1);

    await expect(
      approvals.resolve({
        approvalId: request.id,
        status: 'APPROVED',
        resolvedBy: 'qa@qe.ai',
        resolverRoles: ['QA_ENGINEER'],
      }),
    ).rejects.toThrow(/Invalid transition/);

    await approvals.resolve({
      approvalId: request.id,
      status: 'REVIEW',
      resolvedBy: 'qa@qe.ai',
      resolverRoles: ['QA_ENGINEER'],
    });
    const approved = await approvals.resolve({
      approvalId: request.id,
      status: 'APPROVED',
      resolvedBy: 'lead@qe.ai',
      resolverRoles: ['QE_LEAD'],
    });
    expect(approved.status).toBe('APPROVED');
  });

  it('admins can approve anything', async () => {
    const { approvals } = buildKernel();
    const request = await approvals.request({
      tenantId: TENANT,
      type: 'COMPLIANCE',
      title: 'FCA sign-off',
      subjectType: 'RELEASE',
      subjectId: 'REL-1',
      requestedBy: 'fca-agent',
    });
    const resolved = await approvals.resolve({
      approvalId: request.id,
      status: 'APPROVED',
      resolvedBy: 'admin@qe.ai',
      resolverRoles: ['ADMIN'],
    });
    expect(resolved.status).toBe('APPROVED');
  });
});

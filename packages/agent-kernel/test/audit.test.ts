import { describe, expect, it } from 'vitest';
import { AuditTrail } from '../src/audit.js';

describe('AuditTrail', () => {
  it('hash-chains events and verifies integrity', () => {
    const audit = new AuditTrail();
    audit.record({ tenantId: 't1', kind: 'JIRA_SYNC', actor: 'sync', summary: 'first' });
    audit.record({ tenantId: 't1', kind: 'AGENT_DECISION', actor: 'agent', summary: 'second' });
    audit.record({ tenantId: 't1', kind: 'APPROVAL_RESOLVED', actor: 'user', summary: 'third' });

    expect(audit.verifyChain('t1')).toBeNull();
    const events = audit.query('t1');
    expect(events).toHaveLength(3);
    expect(events[0]!.previousHash).toBe('GENESIS');
    expect(events[1]!.previousHash).toBe(events[0]!.hash);
  });

  it('detects tampering', () => {
    const audit = new AuditTrail();
    audit.record({ tenantId: 't1', kind: 'JIRA_SYNC', actor: 'sync', summary: 'first' });
    audit.record({ tenantId: 't1', kind: 'JIRA_SYNC', actor: 'sync', summary: 'second' });
    const events = audit.query('t1');
    (events[0] as { summary: string }).summary = 'tampered';
    expect(audit.verifyChain('t1')).toBe(1);
  });

  it('isolates tenants', () => {
    const audit = new AuditTrail();
    audit.record({ tenantId: 't1', kind: 'JIRA_SYNC', actor: 'sync', summary: 'a' });
    audit.record({ tenantId: 't2', kind: 'JIRA_SYNC', actor: 'sync', summary: 'b' });
    expect(audit.query('t1')).toHaveLength(1);
    expect(audit.query('t2')).toHaveLength(1);
  });

  it('exports JSON lines for compliance', () => {
    const audit = new AuditTrail();
    audit.record({ tenantId: 't1', kind: 'CONFIG_CHANGED', actor: 'admin', summary: 'threshold changed' });
    const exported = audit.export('t1');
    expect(JSON.parse(exported).summary).toBe('threshold changed');
  });
});

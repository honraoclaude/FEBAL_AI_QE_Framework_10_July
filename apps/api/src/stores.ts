import type { Sprint, Tenant, TestExecution, User, WorkItem } from '@qe-ai/contracts';

/**
 * In-memory repositories behind small port interfaces (hexagonal adapters).
 * Production swaps these for PostgreSQL implementations; route handlers and
 * services depend only on these interfaces.
 */

export class WorkItemStore {
  private items = new Map<string, WorkItem>();

  upsert(item: WorkItem): WorkItem {
    this.items.set(item.id, item);
    return item;
  }

  get(id: string): WorkItem | undefined {
    return this.items.get(id);
  }

  byJiraKey(tenantId: string, jiraKey: string): WorkItem | undefined {
    return this.list(tenantId).find((i) => i.jiraKey === jiraKey);
  }

  list(tenantId: string): WorkItem[] {
    return [...this.items.values()].filter((i) => i.tenantId === tenantId);
  }

  inSprint(tenantId: string, sprintId: string): WorkItem[] {
    return this.list(tenantId).filter((i) => i.sprintId === sprintId);
  }

  backlog(tenantId: string): WorkItem[] {
    return this.list(tenantId).filter((i) => !i.sprintId && i.type === 'STORY');
  }
}

export class SprintStore {
  private sprints = new Map<string, Sprint>();

  upsert(sprint: Sprint): Sprint {
    this.sprints.set(sprint.id, sprint);
    return sprint;
  }

  active(tenantId: string): Sprint | undefined {
    return this.list(tenantId).find((s) => s.state === 'ACTIVE');
  }

  list(tenantId: string): Sprint[] {
    return [...this.sprints.values()].filter((s) => s.tenantId === tenantId);
  }
}

export class TenantStore {
  private tenants = new Map<string, Tenant>();

  upsert(tenant: Tenant): Tenant {
    this.tenants.set(tenant.id, tenant);
    return tenant;
  }

  get(id: string): Tenant | undefined {
    return this.tenants.get(id);
  }
}

export class UserStore {
  private users = new Map<string, User>();

  upsert(user: User): User {
    this.users.set(user.id, user);
    return user;
  }

  byToken(token: string): User | undefined {
    // Demo auth: tokens are `demo-<userId>`. Production uses OAuth/OIDC.
    return this.users.get(token.replace(/^demo-/, ''));
  }

  list(tenantId: string): User[] {
    return [...this.users.values()].filter((u) => u.tenantId === tenantId);
  }
}

export class TestExecutionStore {
  private executions: TestExecution[] = [];

  add(execution: TestExecution): void {
    this.executions.push(execution);
  }

  list(tenantId: string): TestExecution[] {
    return this.executions.filter((e) => e.tenantId === tenantId);
  }
}

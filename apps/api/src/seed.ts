import type { Sprint, Tenant, TestExecution, User } from '@qe-ai/contracts';
import { newId, nowIso, type MemoryStore } from '@qe-ai/agent-kernel';
import type { JiraIssuePayload } from './jira.js';
import type { SprintStore, TenantStore, TestExecutionStore, UserStore } from './stores.js';

export const DEMO_TENANT_ID = 'tenant-demo';
export const DEMO_SPRINT_JIRA_ID = 'sprint-24';

export function seedTenant(tenants: TenantStore): Tenant {
  return tenants.upsert({
    id: DEMO_TENANT_ID,
    name: 'Meridian Wealth (Demo)',
    plan: 'ENTERPRISE',
    region: 'uk-south',
    createdAt: nowIso(),
    settings: {
      gateConfidenceThreshold: 0.7,
      humanApprovalRequired: ['STORY', 'CODE', 'SECURITY', 'COMPLIANCE', 'RELEASE', 'DEPLOYMENT'],
      llmProvider: process.env['ANTHROPIC_API_KEY'] ? 'anthropic' : 'simulated',
      llmModel: 'claude-opus-4-8',
      dataResidency: 'UK',
      regulatoryProfiles: ['FCA', 'CONSUMER_DUTY', 'GDPR'],
    },
  });
}

export function seedUsers(users: UserStore): User[] {
  const defs: Array<[string, string, User['roles']]> = [
    ['po', 'Priya Sharma', ['PRODUCT_OWNER']],
    ['ba', 'Ben Adeyemi', ['BUSINESS_ANALYST']],
    ['dev', 'Dana Kovacs', ['DEVELOPER']],
    ['qa', 'Quinn Alvarez', ['QA_ENGINEER']],
    ['qelead', 'Lena Okafor', ['QE_LEAD']],
    ['architect', 'Arjun Mehta', ['ARCHITECT']],
    ['seclead', 'Sofia Ricci', ['SECURITY_LEAD']],
    ['compliance', 'Charles Whitfield', ['COMPLIANCE_OFFICER']],
    ['release', 'Renee Dubois', ['RELEASE_MANAGER']],
    ['em', 'Marcus Boateng', ['ENGINEERING_MANAGER']],
    ['admin', 'Ada Nwosu', ['ADMIN']],
  ];
  return defs.map(([id, displayName, roles]) =>
    users.upsert({
      id,
      tenantId: DEMO_TENANT_ID,
      email: `${id}@meridianwealth.demo`,
      displayName,
      roles,
      active: true,
    }),
  );
}

export function seedSprints(sprints: SprintStore): Sprint {
  sprints.upsert({
    id: 'sp-23',
    tenantId: DEMO_TENANT_ID,
    jiraId: 'sprint-23',
    name: 'Sprint 23 — Fee Engine Hardening',
    goal: 'Stabilise the fee calculation engine and close escaped defects.',
    state: 'CLOSED',
    startDate: '2026-06-08',
    endDate: '2026-06-19',
  });
  return sprints.upsert({
    id: 'sp-24',
    tenantId: DEMO_TENANT_ID,
    jiraId: DEMO_SPRINT_JIRA_ID,
    name: 'Sprint 24 — Wealth Onboarding',
    goal: 'Ship the digital onboarding journey for wealth clients with full compliance evidence.',
    state: 'ACTIVE',
    startDate: '2026-06-29',
    endDate: '2026-07-10',
  });
}

const ac = (id: string, text: string, testable = true) => ({ id, text, testable });

export const REMOTE_JIRA_ISSUES: JiraIssuePayload[] = [
  {
    jiraKey: 'FSC-101',
    type: 'STORY',
    title: 'Digital onboarding — identity verification step',
    description:
      'As a prospective wealth client, I want to verify my identity digitally during onboarding so that I can open an account without visiting a branch. Integrates with the KYC provider via MuleSoft; failures must route to manual review with full audit history.',
    status: 'In Refinement',
    storyPoints: 8,
    sprintJiraId: DEMO_SPRINT_JIRA_ID,
    labels: ['onboarding', 'kyc', 'mulesoft', 'portal'],
    acceptanceCriteria: [
      ac('FSC-101-ac1', 'Given a new applicant, when identity documents are submitted, then the KYC provider is called and the result is stored on the application record'),
      ac('FSC-101-ac2', 'Given the KYC provider is unavailable, when documents are submitted, then the application is queued for manual review and the applicant is notified'),
      ac('FSC-101-ac3', 'Given a failed verification, when the applicant retries, then a maximum of three attempts is enforced'),
    ],
    linkedPullRequests: [],
    linkedDefectKeys: [],
    updatedAt: '2026-07-08T09:12:00.000Z',
  },
  {
    jiraKey: 'FSC-102',
    type: 'STORY',
    title: 'Fee disclosure screen before product switch',
    description:
      'As a customer using the self-service portal, I want a clear breakdown of all fees and charges before confirming a product switch, so that I can make an informed decision. Fee data comes from the pricing API; customer confirmation must be recorded for audit and Consumer Duty evidence.',
    status: 'In Refinement',
    storyPoints: 5,
    sprintJiraId: DEMO_SPRINT_JIRA_ID,
    labels: ['portal', 'pricing', 'consumer-duty'],
    acceptanceCriteria: [
      ac('FSC-102-ac1', 'Given an authenticated customer, when the fee screen loads, then all applicable fees display with plain-language descriptions'),
      ac('FSC-102-ac2', 'Given fee data cannot be retrieved, when the screen loads, then a retriable error is shown and the journey is blocked'),
      ac('FSC-102-ac3', 'Given a customer confirms the switch, when confirmation is submitted, then the confirmation is stored with a timestamp'),
    ],
    linkedPullRequests: [],
    linkedDefectKeys: [],
    updatedAt: '2026-07-08T10:40:00.000Z',
  },
  {
    jiraKey: 'FSC-103',
    type: 'STORY',
    title: 'Advisor dashboard — household net-worth rollup',
    description:
      'As a financial advisor, I want household-level net-worth rollups on my dashboard so that I can prepare for client reviews faster. Uses FSC rollup framework with Apex fallback for complex ownership structures.',
    status: 'In Development',
    storyPoints: 5,
    sprintJiraId: DEMO_SPRINT_JIRA_ID,
    labels: ['fsc', 'advisor', 'apex'],
    acceptanceCriteria: [
      ac('FSC-103-ac1', 'Given a household with linked accounts, when the dashboard loads, then the net-worth rollup matches the sum of member balances'),
      ac('FSC-103-ac2', 'Given a household with joint ownership, when the rollup runs, then ownership percentages are applied without double counting'),
    ],
    linkedPullRequests: ['PR-441'],
    linkedDefectKeys: [],
    updatedAt: '2026-07-07T15:05:00.000Z',
  },
  {
    jiraKey: 'FSC-104',
    type: 'STORY',
    title: 'Complaint case auto-triage with SLA timers',
    description:
      'As a service manager, I want complaint cases auto-triaged by category and severity with DISP-aligned SLA timers so that regulatory timescales are never breached. Includes omni-channel routing changes and vulnerable-customer flagging.',
    status: 'In Testing',
    storyPoints: 8,
    sprintJiraId: DEMO_SPRINT_JIRA_ID,
    labels: ['service', 'complaints', 'fca', 'vulnerable-customers'],
    acceptanceCriteria: [
      ac('FSC-104-ac1', 'Given a new complaint case, when it is created, then category, severity and SLA timers are set automatically'),
      ac('FSC-104-ac2', 'Given a complaint from a flagged vulnerable customer, when triage runs, then the case routes to the specialist queue'),
      ac('FSC-104-ac3', 'Given an SLA timer at 80% elapsed, when no response has been sent, then the case escalates to the team lead'),
    ],
    linkedPullRequests: ['PR-448', 'PR-452'],
    linkedDefectKeys: ['DEF-2101'],
    updatedAt: '2026-07-08T08:20:00.000Z',
  },
  {
    jiraKey: 'FSC-105',
    type: 'STORY',
    title: 'Quarterly statement generation via Marketing Cloud journey',
    description:
      'As an operations lead, I want quarterly statements generated and distributed through a Marketing Cloud journey so that clients receive statements reliably by email with print fallback.',
    status: 'Release Ready',
    storyPoints: 5,
    sprintJiraId: DEMO_SPRINT_JIRA_ID,
    labels: ['marketing-cloud', 'statements'],
    acceptanceCriteria: [
      ac('FSC-105-ac1', 'Given statement data is ready, when the journey triggers, then emails send with correct personalisation'),
      ac('FSC-105-ac2', 'Given an email hard-bounces, when the bounce is processed, then the client is queued for print fallback'),
    ],
    linkedPullRequests: ['PR-430'],
    linkedDefectKeys: [],
    updatedAt: '2026-07-06T11:00:00.000Z',
  },
  {
    jiraKey: 'FSC-106',
    type: 'BUG',
    title: 'Fee calculation rounds incorrectly for multi-currency accounts',
    description: 'Fees on accounts holding USD and GBP positions round at position level instead of account level, overstating totals by up to 0.02%.',
    status: 'In Testing',
    storyPoints: 3,
    sprintJiraId: DEMO_SPRINT_JIRA_ID,
    labels: ['pricing', 'defect'],
    acceptanceCriteria: [ac('FSC-106-ac1', 'Given a multi-currency account, when fees calculate, then rounding is applied once at account level')],
    linkedPullRequests: ['PR-455'],
    linkedDefectKeys: ['DEF-2088'],
    updatedAt: '2026-07-08T13:45:00.000Z',
  },
  {
    jiraKey: 'FSC-107',
    type: 'STORY',
    title: 'Client portal document vault with granular sharing',
    description:
      'As a client, I want a secure document vault in the portal where my advisor can share documents with me, with sharing rules ensuring only my household sees my documents.',
    status: 'Backlog',
    storyPoints: 8,
    labels: ['portal', 'sharing', 'security'],
    acceptanceCriteria: [
      ac('FSC-107-ac1', 'Given an advisor shares a document, when the client logs in, then the document is visible only to that client household'),
      ac('FSC-107-ac2', 'Given a client without portal access, when sharing is attempted, then the advisor is prompted to invite the client first'),
    ],
    linkedPullRequests: [],
    linkedDefectKeys: [],
    updatedAt: '2026-07-05T09:00:00.000Z',
  },
  {
    jiraKey: 'FSC-108',
    type: 'STORY',
    title: 'Promotional ISA campaign landing journey',
    description:
      'As a marketing manager, I want a promotional landing journey for the new ISA offer with rate display and eligibility checks, so prospects can apply directly. All promotional content requires compliance approval.',
    status: 'Backlog',
    storyPoints: 5,
    labels: ['marketing', 'promotion', 'isa'],
    acceptanceCriteria: [
      ac('FSC-108-ac1', 'Given a prospect visits the landing page, when the page renders, then the promotional rate and key terms display with required risk warnings'),
      ac('FSC-108-ac2', 'Given an ineligible prospect, when eligibility runs, then a clear explanation and alternatives are shown'),
    ],
    linkedPullRequests: [],
    linkedDefectKeys: [],
    updatedAt: '2026-07-04T16:30:00.000Z',
  },
  {
    jiraKey: 'FSC-109',
    type: 'STORY',
    title: 'MuleSoft payments API v2 migration',
    description:
      'Migrate outbound payment initiation from the deprecated payments API v1 to v2, including idempotency keys, webhook status callbacks and reconciliation reporting.',
    status: 'Backlog',
    storyPoints: 13,
    labels: ['mulesoft', 'payments', 'api', 'migration'],
    acceptanceCriteria: [
      ac('FSC-109-ac1', 'Given a payment initiation, when submitted to v2, then an idempotency key prevents duplicate submission on retry'),
      ac('FSC-109-ac2', 'Given a status webhook, when received, then the payment record updates within 30 seconds'),
    ],
    linkedPullRequests: [],
    linkedDefectKeys: [],
    updatedAt: '2026-07-03T10:15:00.000Z',
  },
  {
    jiraKey: 'FSC-110',
    type: 'STORY',
    title: 'Improve advisor search',
    description: 'Search should be better.',
    status: 'Backlog',
    labels: [],
    acceptanceCriteria: [],
    linkedPullRequests: [],
    linkedDefectKeys: [],
    updatedAt: '2026-07-02T12:00:00.000Z',
  },
];

export function seedKnowledge(memory: MemoryStore): void {
  const docs: Array<{ source: Parameters<MemoryStore['ingest']>[0]['source']; title: string; content: string; tags: string[] }> = [
    {
      source: 'FCA_GUIDANCE',
      title: 'FCA Consumer Duty — outcomes summary',
      content:
        'The Consumer Duty (PS22/9) requires firms to act to deliver good outcomes for retail customers across four areas: products and services, price and value, consumer understanding, and consumer support. Firms must evidence outcome monitoring and address foreseeable harm, with particular care for customers with characteristics of vulnerability (FG21/1).',
      tags: ['consumer-duty', 'fca'],
    },
    {
      source: 'FCA_GUIDANCE',
      title: 'FCA financial promotions — core rules',
      content:
        'Financial promotions must be fair, clear and not misleading (COBS 4 / CONC 3). Promotional rates require balanced presentation of risk warnings and key terms with equal prominence. Approval records must be retained and promotions withdrawn promptly when terms change.',
      tags: ['promotions', 'fca'],
    },
    {
      source: 'PAST_DEFECT',
      title: 'DEF-1902: Fee rounding escaped to production (2026-03)',
      content:
        'Multi-currency fee rounding defect escaped to production in the March release. Root cause: boundary scenarios missing from regression pack; rounding applied per position. Learning: pricing changes must always include multi-currency boundary scenarios and account-level assertion of totals.',
      tags: ['pricing', 'defect', 'learning'],
    },
    {
      source: 'INTERNAL_STANDARD',
      title: 'Apex coding standard — bulkification and limits',
      content:
        'All Apex must be bulk-safe: no SOQL/DML in loops, use of collections and maps for lookups, governor-limit headroom of at least 40% in tests at 200-record volume. Trigger logic lives in handler classes; one trigger per object.',
      tags: ['apex', 'standard'],
    },
    {
      source: 'PRODUCTION_INCIDENT',
      title: 'INC-311: KYC provider outage handling gap (2026-05)',
      content:
        'KYC provider outage caused onboarding applications to fail silently for 40 minutes. Learning: all external integration journeys require explicit unavailable-path scenarios, queue-based fallback, and customer-facing status messaging. Monitoring must alert within 5 minutes of elevated failure rates.',
      tags: ['kyc', 'integration', 'incident'],
    },
    {
      source: 'ARCHITECTURE_DOC',
      title: 'Integration architecture — MuleSoft API-led standard',
      content:
        'Integrations follow API-led connectivity: experience APIs for channels, process APIs for orchestration, system APIs for backends. All process APIs must implement idempotency keys, correlation IDs, and circuit breakers with documented fallback behaviour.',
      tags: ['mulesoft', 'architecture'],
    },
  ];
  for (const doc of docs) {
    memory.ingest({ tenantId: DEMO_TENANT_ID, ...doc, uri: undefined });
  }
}

export function seedTestExecutions(executions: TestExecutionStore): void {
  const suites: TestExecution['suite'][] = ['UNIT', 'FUNCTIONAL', 'REGRESSION', 'SMOKE', 'API', 'UI', 'E2E'];
  const stories = ['FSC-103', 'FSC-104', 'FSC-105', 'FSC-106'];
  let i = 0;
  for (const storyKey of stories) {
    for (const suite of suites) {
      for (let n = 0; n < 3; n++) {
        i += 1;
        executions.add({
          id: newId('exec'),
          tenantId: DEMO_TENANT_ID,
          scenarioId: `scn-seed-${i}`,
          storyId: storyKey,
          suite,
          result: i % 11 === 0 ? 'FAILED' : i % 17 === 0 ? 'SKIPPED' : 'PASSED',
          durationMs: 1200 + (i % 7) * 800,
          environment: 'SIT',
          executedAt: nowIso(),
          defectKey: i % 11 === 0 ? 'DEF-2101' : undefined,
        });
      }
    }
  }
}

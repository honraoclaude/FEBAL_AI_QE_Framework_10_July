# Workflow & Sequence Diagrams

Workflows are configuration (`packages/agents/src/workflows.ts`): tenants can
re-order steps, change parallel groups, retries and approval points without
code changes. The orchestrator (`packages/agent-kernel/src/orchestrator.ts`)
provides sequential + parallel execution, retries, pause/resume/rollback,
human-approval gates, context passing, state, memory and mermaid rendering.

## Phase 1 — Refinement

```mermaid
flowchart TD
  J[JIRA Sync] --> SA[Story Analysis]
  SA --> SI[Salesforce Impact Analysis]
  SI --> TA[Three Amigos]
  TA --> FCA[FCA Review]
  TA --> CD[Consumer Duty Review]
  FCA --> BDD[BDD Generator]
  CD --> BDD
  BDD --> AR[Automation Recommendation]
  AR --> RG{Refinement Gate}
  RG -->|pass| HA[/Human Approval/]
  RG -->|fail| BACK[Return to refinement with actions]
  HA -->|approved| DR([Development Ready])
  HA -->|rejected| BACK
```

FCA and Consumer Duty reviews run as a **parallel group**; the gate blocks on
INVEST, DoR ≥ 0.7, BDD completeness, risk review, compliance and automation
review, then always pauses for human approval.

## Phase 2 — Development

```mermaid
flowchart TD
  CG[Code Generation] --> AV[Architecture Validation]
  AV --> CR[Code Review]
  AV --> SR[Security Review]
  AV --> PR[Performance Review]
  CR --> UT[Unit Test Generation]
  SR --> UT
  PR --> UT
  UT --> CA[Coverage Analysis]
  CA --> DG{Development Gate}
  DG --> HA[/Human Approval/]
  HA --> TR([Testing Ready])
```

## Phase 3 — Testing

```mermaid
flowchart TD
  EV[Environment Validation] --> TD1[Test Data]
  TD1 --> RS[Regression Selection]
  RS --> API1[API] & UI1[UI] & SEC[Security] & PERF[Performance] & ACC[Accessibility]
  API1 & UI1 & SEC & PERF & ACC --> COMP[Compliance]
  COMP --> AE[Automation Execution]
  AE --> DA[Defect Analysis]
  DA --> RCA[Root Cause]
  RCA --> TG{Testing Gate}
  TG --> HA[/Human Approval/]
  HA --> RR([Release Ready])
```

## Phase 4 — Release

```mermaid
flowchart TD
  RR[Release Readiness] --> RA[Risk Assessment]
  RA --> BC[Business Communication] & RN[Release Notes]
  BC & RN --> RB[Rollback Readiness]
  RB --> DAp[Deployment Approval]
  DAp --> RG{Release Gate}
  RG --> HA[/Human Approval/]
  HA --> DEP([Deploy])
```

## Phase 5 — Deploy & Learn

```mermaid
flowchart TD
  CI[CI/CD] --> DEP[Deployment] --> PV[Production Validation]
  PV --> MON[Monitoring] & OBS[Observability]
  MON & OBS --> ID[Incident Detection]
  ID --> KU[Knowledge Update] --> DOC[Documentation]
  DOC --> LEARN[Learning] --> MET[Metrics] --> CIm[Continuous Improvement]
```

## Sequence — refinement run with human gate

```mermaid
sequenceDiagram
  actor PO as Product Owner
  participant API
  participant WF as Workflow Engine
  participant AG as Agents (8)
  participant MEM as Memory
  participant GOV as Governance/Audit
  participant APR as Approval Service

  PO->>API: POST /workflows/refinement/start {storyId}
  API->>WF: start(run, context={story})
  loop each step (parallel where grouped)
    WF->>AG: execute(context = working memory)
    AG->>MEM: retrieve knowledge (RAG)
    AG->>AG: deterministic analysis + LLM narrative
    AG-->>WF: AgentDecision (governance envelope)
    WF->>GOV: audit AGENT_DECISION (hash-chained)
    WF->>MEM: merge payload into working memory
  end
  WF->>APR: gate reached → approval request (STORY, PO/BA roles)
  WF-->>API: run AWAITING_APPROVAL
  PO->>API: POST /approvals/{id}/resolve APPROVED
  APR->>GOV: audit APPROVAL_RESOLVED
  APR-->>WF: approval.resolved event
  WF->>WF: resume, complete run
  WF->>GOV: audit WORKFLOW_COMPLETED
  API-->>PO: story = Development Ready
```

## Sequence — JIRA bidirectional sync

```mermaid
sequenceDiagram
  participant SCH as Scheduler (cron)
  participant SYNC as JiraSyncService
  participant JIRA as JIRA Cloud (OAuth 2.0)
  participant WI as WorkItem Store
  participant AUD as Audit

  SCH->>SYNC: sync(INCREMENTAL)
  SYNC->>JIRA: fetch issues updated since lastSyncAt
  JIRA-->>SYNC: issues
  loop each issue
    SYNC->>WI: upsert / detect conflicts (both sides changed)
  end
  SYNC->>JIRA: push locally-progressed stages (bidirectional)
  SYNC->>AUD: JIRA_SYNC record (pulled/updated/pushed/conflicts)
```

## Orchestrator state machine

```mermaid
stateDiagram-v2
  [*] --> RUNNING: start
  RUNNING --> AWAITING_APPROVAL: gate / humanApproval step
  AWAITING_APPROVAL --> RUNNING: approved
  AWAITING_APPROVAL --> FAILED: rejected
  RUNNING --> PAUSED: pause
  PAUSED --> RUNNING: resume
  RUNNING --> FAILED: retries exhausted
  RUNNING --> COMPLETED: all steps done
  COMPLETED --> ROLLED_BACK: rollback
  FAILED --> ROLLED_BACK: rollback
  RUNNING --> CANCELLED: cancel
```

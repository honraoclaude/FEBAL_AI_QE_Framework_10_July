# Product Vision, Requirements & Platform User Stories

## 1. Product Vision

**QE.ai is the AI Operating System for Quality Engineering.**

Enterprise Salesforce delivery — Financial Services Cloud, Sales, Service,
Marketing, Experience and Data Cloud, Apex, LWC, OmniStudio, MuleSoft and
surrounding integrations — is slowed by manual refinement, late defect
discovery, compliance evidence gathering and fragmented tooling. QE.ai replaces
that fragmentation with a single platform where **intelligent AI agents
collaborate across the complete SDLC**, continuously improving quality while
shifting it left.

### North-star outcomes

| Outcome | Target |
|---|---|
| Production defect leakage | −60% within 12 months |
| Refinement cycle time | −50% (story → Development Ready) |
| Automation coverage | 80%+ of regression scope |
| Compliance evidence effort | −70% (generated as a by-product of delivery) |
| Release confidence | Predictive go/no-go with explainable evidence |

### Differentiators vs Copado / Tricentis / ACCELQ / generic copilots

1. **Agentic, not assistive** — 90+ specialised agents execute the workflow;
   humans approve at governed gates rather than driving every step.
2. **Traceability as a first-class object** — Business Objective → Epic →
   Feature → Story → AC → BDD → tests → execution → defects → release →
   production → learning, captured automatically in the knowledge graph.
3. **Regulated-industry native** — FCA and Consumer Duty agents, evidence
   capture, immutable audit and role-based approval matrices out of the box.
4. **Explainability by construction** — every AI decision ships with the full
   governance envelope (reasoning, evidence, confidence, risk, impacts,
   alternatives, prompt/LLM/knowledge versions).
5. **Continuously learning** — every acceptance, rejection, defect and incident
   feeds retrieval for future decisions.

## 2. Functional Requirements

### FR-1 JIRA synchronisation
- OAuth 2.0 (3LO) authentication to JIRA Cloud.
- Sync epics, features, stories, tasks, subtasks, bugs, acceptance criteria,
  story points, sprints, sprint goals, backlog, linked PRs/defects/test cases.
- Modes: auto, manual, scheduled (cron), incremental; bi-directional with
  conflict detection and resolution policy (local/remote/manual).

### FR-2 Agent execution (phases 1–5)
- Phase 1 Refinement: story analysis, Salesforce impact, Three Amigos, FCA,
  Consumer Duty, BDD design, automation recommendation, refinement gate.
- Phase 2 Development: code/LWC/flow generation, SOQL & governor-limit
  analysis, architecture/security/code review, static analysis & PMD, debt
  detection, performance, unit-test & test-data generation, PR review,
  documentation, development gate.
- Phase 3 Testing: risk-based testing, regression optimisation/selection,
  API/UI/accessibility/performance/security/compliance/integration testing,
  test-data management, synthetic data, environment readiness, automation
  execution, coverage analysis, defect triage, duplicate detection, RCA,
  automation maintenance, testing gate.
- Phase 4 Release: release/business readiness, risk assessment, known issues,
  defect triage, release notes, business communications, deployment approval,
  rollback readiness, release gate.
- Phase 5 Deploy & Learn: deployment, CI/CD, production validation, monitoring,
  observability, incident detection, root-cause prediction, documentation
  update, knowledge learning, continuous improvement, production health.
- Global: health monitor, orchestrator, memory/knowledge/prompt managers,
  hallucination detector, cost optimiser, LLM performance analyser, governance,
  audit, notifications, security governance, human approval, metrics, plus the
  eight predictive agents.

### FR-3 Workflow orchestration
- Configurable workflows per phase: order, parallel groups, retries, pause /
  resume / rollback, context passing, state and memory management, mermaid
  visualisation, progress reporting.

### FR-4 Governance, approvals, audit
- Governance envelope mandatory on every decision (see doc 07).
- Configurable approval workflows across 12 artefact types and 8 statuses;
  role-based approval matrix across 11 roles.
- Immutable, hash-chained, exportable audit trail.

### FR-5 Knowledge platform & feedback
- Ingestion from JIRA, Confluence, Git hosts, Salesforce metadata, incidents,
  release notes, architecture docs, past defects/tests, FCA/Consumer Duty
  guidance and internal standards; versioned; RAG retrieval into every agent.
- Feedback (accepted/rejected/modified + comments) on every recommendation,
  persisted to memory to improve future retrieval.

### FR-6 Dashboards & predictions
- Home dashboard (12 signals), PO / Squad / Leadership dashboards, agent
  health dashboard, eight predictive models.

## 3. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Availability | 99.9% platform SLO; regional active-passive DR, RPO ≤ 5 min, RTO ≤ 1 h |
| Performance | API p95 < 300 ms (non-LLM); agent step p95 < 60 s; dashboard load < 2 s |
| Scalability | Horizontal: stateless services on K8s HPA; 1 000+ tenants; 10 000+ stories/tenant |
| Multi-tenancy | Tenant isolation at data (row-level + schema), compute (quotas) and model (per-tenant knowledge) layers |
| Security | OAuth2/OIDC, SSO/SAML, RBAC+ABAC, TLS 1.3, AES-256 at rest, secrets manager, SOC 2 / ISO 27001 controls, GDPR |
| Explainability | 100% of AI decisions carry the governance envelope; prompt/LLM/knowledge versions recorded |
| Auditability | Append-only hash-chained trail; compliance export; 7-year retention (configurable) |
| Cost | Per-tenant token budgets; model right-sizing by task class; cache-first prompting |
| Observability | OpenTelemetry traces/metrics/logs on every service and agent step |
| Extensibility | New agents register declaratively (definition + prompt + implementation) with no orchestrator change |

## 4. Platform User Stories (selected, prioritised)

**Epic A — JIRA & Backlog**
- A1. As a PO, I connect JIRA via OAuth so my backlog and sprints appear in QE.ai. *(AC: OAuth flow, projects selectable, initial sync < 5 min)*
- A2. As a BA, I trigger manual/incremental sync and see conflicts with resolution choices.

**Epic B — Refinement**
- B1. As a PO, I run the refinement pipeline on a story and receive a DoR score, risks and missing information. 
- B2. As a QA, I receive a tagged BDD pack covering happy/negative/boundary/NFR paths mapped to acceptance criteria.
- B3. As a Compliance Officer, I am asked to approve any story with FCA/Consumer Duty exposure before it becomes Development Ready.
- B4. As a QE Lead, stories cannot leave refinement until the gate passes and a human approves.

**Epic C — Development & Testing**
- C1. As a Developer, generated Apex/LWC/tests follow org standards and are reviewed by security/architecture agents before I raise a PR.
- C2. As a QA, regression selection reflects the Salesforce impact analysis of each story.
- C3. As a QE Lead, testing cannot complete until coverage, defect policy and compliance evidence pass the testing gate.

**Epic D — Release & Learn**
- D1. As a Release Manager, I receive readiness, risk, rollback and communication packages and give the final deployment approval.
- D2. As an Engineering Manager, production incidents automatically create knowledge entries that influence future refinement.

**Epic E — Governance**
- E1. As an approver, I see the full reasoning/evidence/confidence for any decision I'm asked to approve.
- E2. As an auditor, I export the tamper-evident trail for any story or release.
- E3. As an Admin, I configure the approval matrix and gate confidence thresholds per tenant.

# Roadmaps & Implementation Plan

## 1. MVP roadmap (quarters 1–2)

**Goal:** a design partner runs Phase 1 end-to-end on real JIRA data.

| Sprint block | Scope | Status in this repo |
|---|---|---|
| M1 | Monorepo, contracts, kernel (orchestrator, governance, approvals, audit, memory, prompts, LLM port) | ✅ shipped |
| M2 | Refinement agents (8, deep) + workflows for all 5 phases + heuristic catalog (90+) | ✅ shipped |
| M3 | REST API, JIRA sync (mock adapter behind port), seed dataset, metrics, predictions | ✅ shipped |
| M4 | Web app: dashboard, sprint/backlog, 5 phase workspaces, agents, knowledge, metrics, reports, admin, settings | ✅ shipped |
| M5 | Docker/K8s/CI, docs | ✅ shipped |
| M6 | Real JIRA Cloud OAuth adapter; PostgreSQL adapters; SSE run streaming | next |

## 2. Development roadmap (quarters 2–4)

1. **Persistence & scale-out:** PostgreSQL + pgvector adapters, Kafka bus,
   Temporal-backed orchestrator for multi-hour runs, SSE/WebSocket run updates.
2. **Deep Phase 2/3 agents:** replace heuristic engines with tool-using agents
   (sfdx metadata reads, PMD execution, Playwright/k6 runners, coverage
   ingestion from CI).
3. **Salesforce org connection:** metadata API impact analysis, org-aware
   regression selection, deployment via Salesforce CLI / DevOps Center.
4. **Git integration:** PR review agent on GitHub/ADO webhooks; link PRs to
   stories automatically.
5. **Knowledge graph service:** Neo4j projection + traceability UI.

## 3. Enterprise roadmap (quarters 4–6)

- SSO/SAML + SCIM; per-tenant encryption keys; residency-pinned deployments.
- SOC 2 Type II audit; ISO 27001 certification programme.
- Approval-matrix editor, custom workflow designer (drag-and-drop over the
  existing definition format), custom agent SDK for customers.
- Marketplace of tenant-specific agents and prompt packs.
- Multi-region active-passive DR; usage-based billing + token budget console.

## 4. AI maturity roadmap

| Level | Capability | Mechanism |
|---|---|---|
| 1 Assisted | Agents draft, humans do | shipped: envelopes + approvals |
| 2 Supervised | Agents execute, humans approve gates | shipped: gatekeepers + matrix |
| 3 Conditional | Auto-approve low-risk decisions above confidence + acceptance-rate thresholds | feedback loop drives per-agent trust scores |
| 4 Learning | Prompt/model selection tuned automatically from feedback + outcomes | Prompt Manager + LLM Performance Analyzer evaluations |
| 5 Self-optimising | Workflows re-shape themselves (skip/parallelise steps) from historical run data | Continuous Improvement agent proposes definition changes via KNOWLEDGE_UPDATE approvals |

## 5. Implementation plan (how to take this repo to production)

1. **Week 1–2 — persistence.** Implement PostgreSQL repositories for the six
   store ports and a pgvector `MemoryStore`; wire by swapping the composition
   root (`apps/api/src/platform.ts`). No service changes.
2. **Week 2–3 — real JIRA.** Implement `JiraPort` against JIRA Cloud REST +
   OAuth 3LO (tokens in secrets manager); keep the mock for tests.
3. **Week 3–4 — live LLM hardening.** Enable `AnthropicLlmProvider` per tenant;
   add retries/budgets/caching; run the prompt library through an eval set.
4. **Week 4–6 — pilot.** Deploy `infra/k8s` to a staging cluster; onboard a
   design-partner tenant; run Sprint refinement in shadow mode; measure DoR
   accuracy and approval acceptance rates against the feedback loop.
5. **Week 6+ —** iterate per the development roadmap; graduate agents from
   heuristic to tool-using one phase at a time, keeping the deterministic layer
   as the regression baseline.

**Definition of done for every increment:** typecheck + tests green in CI,
audit chain intact, governance envelope on every new decision type, docs
updated in this set.

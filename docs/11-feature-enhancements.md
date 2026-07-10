# Feature Enhancement Backlog

Expert analysis of the shipped platform (commit `65fcb66`) translated into an
actionable enhancement backlog. Each item carries an ID for JIRA import, an
effort class, and the implementation seam in this repo.

**Effort classes:** `QW` = quick win (days) · `BLD` = build (weeks) ·
`BET` = strategic differentiator (roadmap-level).

**Recommended first wave:** ENH-17, ENH-13, ENH-03, ENH-10, ENH-06 — these
convert the platform's strongest existing assets (governance data + event bus)
into visible customer value fastest. Strategic bets: ENH-05, ENH-12.

---

## Theme A — Agentic AI upgrades

### ENH-01 · Tool-using agents `BLD`
Agents currently reason over context; the step change is letting them **act**:
Salesforce Impact reading real org metadata (`sfdx force:mdapi` /
`MetadataComponentDependency`), PMD Review executing PMD, UI Testing driving
Playwright, Coverage Analyzer parsing CI artifacts.
*Seam:* add a `ToolPort` sibling to `LlmProvider` in
`packages/agent-kernel/src/llm.ts`; expose tools as **MCP servers** (JIRA,
GitHub, Salesforce org, test runners); grant tools declaratively per agent in
`packages/agents/src/catalog.ts`.
*Value:* moves agents from advisory to executive; unlocks provable impact
analysis and real execution results.

### ENH-02 · Adversarial agent debate at gates `BLD`
Before a gatekeeper decides, run a "prosecutor" pass (hunt reasons to block)
and a "defender" pass (argue readiness); the gate adjudicates. Debate
transcripts land in the decision `evidence`.
*Seam:* a `DebateAgent` wrapper around gatekeepers in
`packages/agents`; no orchestrator change needed.
*Value:* measurably reduces false-pass rates on judgment calls; richer
audit evidence.

### ENH-03 · Confidence calibration loop `QW`
Decisions store confidence; feedback stores accept/reject outcomes. Compute
per-agent calibration (Brier score): "says 85%, right 60% of the time" →
auto-adjust that agent's effective gate threshold and surface a trust score on
the Agent Health board.
*Seam:* join `FeedbackService` outcomes with decisions in
`packages/agent-kernel`; new field on `AgentHealth`.
*Value:* calibrated AI trust scoring — no competitor does this; the data model
already supports it.

### ENH-04 · Self-healing workflows `BLD`
On step failure, a `RemediationAgent` diagnoses and proposes: retry with
modified context, skip with documented risk, or route to an alternative agent
— instead of blind retries.
*Seam:* hook in `WorkflowEngine.executeStep` failure path
(`packages/agent-kernel/src/orchestrator.ts`).

### ENH-05 · Simulation mode / release digital twin `BET`
Run the entire pipeline **speculatively** over a proposed sprint scope before
commitment: predicted gate failures, compliance exposure, automation debt per
candidate story set. The deterministic agent layer makes simulation cheap.
*Value:* turns QE.ai into a sprint-planning tool used **before** delivery
starts — a new persona moment (PO/RTE) and a capability competitors cannot
retrofit.

## Theme B — Learning & knowledge

### ENH-06 · Feedback-driven prompt evals `QW`
Turn accumulated ACCEPTED/REJECTED decision pairs into a regression eval set;
a prompt version bump must beat its predecessor on the eval before the Prompt
Manager rolls it out.
*Seam:* `PromptLibrary` versioning + `FeedbackService`; eval harness as a
vitest suite fed from exported feedback.
*Value:* makes prompt versioning real governance rather than metadata.

### ENH-07 · Defect-escape post-mortem agent `BLD`
When a production defect traces back to a story, an agent answers: *which gate
should have caught this and what check was missing?* It proposes a new
aspect / scenario template as a `KNOWLEDGE_UPDATE` approval.
*Value:* the self-improving QE flywheel in concrete, governed form.

### ENH-08 · Cross-tenant anonymised learning `BET`
Aggregate pattern-level learnings (e.g. which BDD categories catch escapes in
FSC orgs) across tenants — opt-in, differential privacy.
*Value:* network effects; the only durable SaaS moat in this category.

### ENH-09 · Production embedding model `QW`
Replace deterministic hash embeddings with a real embedding model behind the
existing `embed()` seam (`packages/agent-kernel/src/memory.ts`); A/B retrieval
hit-rates. Retrieval quality caps every downstream agent.

## Theme C — Salesforce-native depth

### ENH-10 · Metadata-diff impact analysis `BLD`
Replace keyword rules with actual org dependency graphs
(`MetadataComponentDependency`); regression selection becomes minimal-set
computation on the knowledge graph. Impact becomes **provable**.
*Seam:* new adapter behind the Salesforce Impact agent; graph contracts
already in `packages/contracts/src/knowledge.ts`.

### ENH-11 · Governor-limit prediction from telemetry `BLD`
Ingest debug logs / Apex test timings to predict CPU/heap/SOQL consumption per
change instead of heuristic scoring.

### ENH-12 · QA for Agentforce `BET`
Position QE.ai agents as testers of customers' own Salesforce AI agents:
prompt-injection probes, grounding checks, journey regression for GenAI
features. An unowned category; the orchestration + governance harness already
exists here.

## Theme D — Governance & compliance

### ENH-13 · Evidence packs `QW`
One-click export per story/release: decisions + approvals + tagged scenario
executions + audit slice as a signed PDF/ZIP.
*Seam:* compose from existing stores + `AuditTrail.export`; new API route +
UI button on Reports and story detail.
*Value:* compliance officers will buy the product for this alone.

### ENH-14 · EU AI Act / NIST AI RMF conformity mapping `BLD`
Map the governance envelope to ISO 42001 / NIST AI RMF control IDs and emit a
conformity report per tenant. Regulated FS buyers are asking for exactly this
in 2026 procurement.

### ENH-15 · Externally anchored audit `QW`
Periodically publish each tenant's latest chain hash to an external notary
(object-lock bucket or transparency log) so immutability is externally
verifiable, not just internally consistent.
*Seam:* small scheduled job over `AuditTrail`; verification endpoint extends
`/api/v1/audit/verify`.

### ENH-16 · Risk-tiered autonomy policies `BLD`
Formalise the AI-maturity ladder into per-agent policy-as-config: low-risk +
well-calibrated agents auto-approve; FCA-scoped decisions always require
humans. Policy changes are themselves audited approvals.
*Depends on:* ENH-03 (calibration).

## Theme E — Product & UX

### ENH-17 · Live run streaming `QW`
Stream `workflow.step.completed` events over SSE/WebSocket so Live Workflow
board cards flip in real time.
*Seam:* the `EventBus` already publishes everything needed; add an SSE route
in `apps/api/src/server.ts` and a subscription hook in
`apps/web/src/pages/LiveWorkflow.tsx`.
*Value:* the demo moment that sells the product.

### ENH-18 · Traceability thread view `QW`
Single vertical timeline per story: JIRA → analysis → workshop → BDD → code →
tests → release → production signal; each node expands to its decision.
Knowledge-graph contracts already support it.

### ENH-19 · Grounded platform copilot `BLD`
Conversational interface over runs/decisions/audit ("Why is FSC-104
blocked?") answering with citations to decision IDs. Structured, versioned
ground truth makes hallucination risk unusually low.

### ENH-20 · What-changed release diff `BLD`
Per release: stories, metadata surface, regression executed vs skipped *and
why* (agent evidence), residual risk — the go/no-go meeting artifact.

### ENH-21 · Slack/Teams approval actions `QW`
Approval requests pushed to chat with approve/reject actions honouring the
role matrix. Approval latency is the real-world bottleneck of gate-based
systems.
*Seam:* Notification Manager agent + `approval.requested` bus topic.

## Theme F — Engineering hardening (prerequisites)

| ID | Item | Class | Seam |
|---|---|---|---|
| ENH-22 | PostgreSQL/pgvector adapters; Temporal for long-lived tool-using runs | `BLD` | store ports in `apps/api/src/stores.ts`, composition root `platform.ts` |
| ENH-23 | OpenTelemetry spans: run → step → LLM call | `QW` | `WorkflowEngine.executeStep`, `LlmProvider` adapters |
| ENH-24 | Real JIRA Cloud OAuth adapter | `QW` | `JiraPort` in `apps/api/src/jira.ts` |
| ENH-25 | Per-tenant token budgets + tiered model routing (cheap model for aspect checks, frontier for gates/compliance) | `BLD` | LLM port + tenant settings |

---

## Dependency notes

- ENH-16 depends on ENH-03; ENH-05 benefits from ENH-10 (real impact data).
- ENH-01 is the enabling investment for ENH-10, ENH-11 and deep Phase-2/3
  agents (see `docs/10-roadmaps-and-implementation.md` §2).
- ENH-22/23/24 are prerequisites for any production pilot and should ride in
  the same increment as the first wave.

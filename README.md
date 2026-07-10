# QE.ai — AI Agentic Quality Engineering Platform

**The AI Operating System for Quality Engineering**, built for Salesforce
ecosystems (Financial Services Cloud, Sales/Service/Marketing/Experience/Data
Cloud, Apex, LWC, OmniStudio, MuleSoft and external integrations).

90+ specialised AI agents collaborate across the complete SDLC — Refinement →
Development → Testing → Release → Deploy & Learn — under enterprise AI
governance: every decision ships with reasoning, evidence, confidence, risk and
impact; gatekeepers block progression; humans approve through a role-based
matrix; everything lands in an immutable, hash-chained audit trail; and the
platform learns continuously from feedback, defects and incidents.

## Quick start

```bash
npm install
npm run dev:api     # REST API on http://localhost:4000
npm run dev:web     # Web app on http://localhost:5173 (proxies /api)
npm test            # 30 tests: kernel, agents, API
```

Runs fully offline in **deterministic demo mode** (simulated LLM provider) with
a seeded financial-services tenant. Set `ANTHROPIC_API_KEY` to enable live
Claude reasoning (`claude-opus-4-8`) on every agent decision.

Containerised: `docker compose up` → web on :8080. Kubernetes manifests in
`infra/k8s/`, CI/CD in `.github/workflows/ci.yml`.

## What's inside

| Path | Contents |
|---|---|
| `packages/contracts` | Shared domain model — stories, agents, workflows, approvals, audit, BDD, JIRA, knowledge, metrics |
| `packages/agent-kernel` | Platform kernel — base agent + governance envelope, workflow orchestrator (parallel steps, retries, pause/resume/rollback, human gates), event bus, versioned prompt library, working + long-term memory with vector retrieval, hash-chained audit, approval service, feedback loop, LLM provider ports (Anthropic + deterministic) |
| `packages/agents` | The catalog: 8 deep refinement agents (Story Analysis, Salesforce Impact, Three Amigos, FCA, Consumer Duty, BDD Designer, Automation Recommendation, Refinement Gatekeeper) + 80+ agents across Development, Testing, Release, Deploy & Learn, Global and Predictive, plus the five phase workflows and prompt library |
| `apps/api` | Fastify REST API — JIRA sync (OAuth port + mock adapter, bi-directional, conflict detection), dashboards/metrics/predictions, workflow + approval + audit + knowledge + feedback endpoints, seeded demo tenant |
| `apps/web` | Premium dark-theme enterprise UI — dashboard, sprint/backlog, five phase workspaces with live agent pipelines and governed decision cards, agent health board, knowledge centre with semantic search, metrics + predictions, audit reports, administration, settings |
| `infra/`, `docker-compose.yml`, `.github/` | Docker, Kubernetes (HPA, probes, ingress), GitHub Actions CI/CD |
| `docs/` | Full architecture set: vision & requirements, agent architecture & memory & A2A, workflow/sequence diagrams, database + knowledge-graph + vector design, API specs, UI/UX designs, governance/approvals/audit, security, SaaS/deployment, roadmaps & implementation plan |

## Demo walkthrough

1. Open the **Dashboard** — AI/sprint/release/compliance health, quality and
   automation trends, pending approvals, agent status.
2. **Backlog** → *Sync with JIRA* pulls the seeded FSC project (10 work items).
3. **Refinement** → pick `FSC-102 Fee disclosure screen` → *Run Refinement
   Pipeline*. Watch eight agents execute (FCA + Consumer Duty in parallel),
   then the gate pauses for human approval.
4. Review each **decision card**: reasoning, evidence, confidence, risk,
   prompt/LLM/knowledge versions. Approve as the Product Owner (role switcher,
   top right) — the story becomes Development Ready.
5. **Reports** — verify the tamper-evident audit chain and export it.
6. Continue through Development → Testing → Release → Deploy & Learn the same
   way.

## Engineering notes

- **Deterministic-first, LLM-enriched**: every agent grounds its decision in a
  deterministic domain layer (testable, reproducible, offline-capable); a live
  LLM adds expert narrative through versioned, knowledge-grounded prompts.
- Hexagonal architecture: LLM, JIRA and persistence are ports; adapters swap in
  the composition root (`apps/api/src/platform.ts`) without touching services.
- TDD: 30 tests cover orchestration (retries, parallelism, gates,
  rollback), approval matrix + transitions, audit chain integrity/tampering,
  the full refinement pipeline and every API surface.

See [docs/README.md](docs/README.md) for the complete deliverable map.

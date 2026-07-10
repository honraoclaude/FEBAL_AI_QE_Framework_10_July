# AI Governance, Human Approval & Audit Frameworks

## 1. AI Governance Framework

### The governance envelope (mandatory on every decision)

Enforced by `BaseAgent` (`packages/agent-kernel/src/agent.ts`) — an agent
cannot emit output without it:

| Field | Purpose |
|---|---|
| `reasoning` | Explainable narrative: deterministic assessment + model narrative |
| `evidence[]` | Concrete facts the decision rests on |
| `confidence` (0–1) | Calibrated self-assessment; gates escalate below threshold |
| `risk` | LOW / MEDIUM / HIGH / CRITICAL |
| `businessImpact / technicalImpact / complianceImpact` | Tri-lens impact statement |
| `recommendedAction` + `alternativeRecommendations[]` | Primary + fallback paths |
| `approver / approvalStatus` | PENDING → APPROVED/REJECTED (AUTO_APPROVED for non-gate agents) |
| `promptVersion / llmVersion / knowledgeVersion` | Full reproducibility triplet |
| `createdAt / version` | Temporal + revision identity |

### Governance controls

- **Confidence gating** — gatekeeper decisions below the tenant threshold
  (default 0.7) escalate to human approval even when checks pass.
- **Hallucination control** — decisions are grounded in deterministic evidence;
  the Hallucination Detector agent cross-checks narrative claims against the
  evidence list and knowledge sources.
- **Prompt governance** — prompts are versioned artefacts; changes roll out via
  the Prompt Manager behind evaluation, and every decision pins its version.
- **Model governance** — provider/model configured per tenant; the LLM
  Performance Analyzer tracks drift; the Cost Optimizer right-sizes models.
- **Explainability SLA** — any decision can be reconstructed: envelope + prompt
  version + knowledge version + audit record.

## 2. Human Approval Framework

Implementation: `packages/agent-kernel/src/approvals.ts`.

### Statuses & transitions

```
DRAFT → REVIEW → APPROVED | REJECTED | CHANGES_REQUESTED | EXPIRED | CANCELLED
CHANGES_REQUESTED → REVIEW          APPROVED/REJECTED/EXPIRED → REOPENED → REVIEW
```

Illegal transitions are rejected (unit-tested). Comments attach to any
resolution; expiry is configurable per request.

### Approval types (12)

STORY · BDD · ARCHITECTURE · CODE · SECURITY · COMPLIANCE · AUTOMATION ·
REGRESSION · RELEASE · DEPLOYMENT · DOCUMENTATION · KNOWLEDGE_UPDATE

### Role-based approval matrix (default; configurable per tenant)

| Type | Roles |
|---|---|
| STORY | Product Owner, Business Analyst |
| BDD | QA Engineer, QE Lead |
| ARCHITECTURE | Architect |
| CODE | Developer, Engineering Manager |
| SECURITY | Security Lead |
| COMPLIANCE | Compliance Officer |
| AUTOMATION | QE Lead |
| REGRESSION | QE Lead, QA Engineer |
| RELEASE | Release Manager |
| DEPLOYMENT | Release Manager, Engineering Manager |
| DOCUMENTATION | Business Analyst, QE Lead |
| KNOWLEDGE_UPDATE | QE Lead, Architect |

ADMIN may resolve any type. Enforcement is server-side at resolution time; an
unauthorised role receives a 400 with the required roles named.

### Workflow integration

Gates create approvals automatically (phase → type mapping); the workflow run
enters `AWAITING_APPROVAL`; resolution events resume (approved) or fail
(rejected) the run — fully event-driven, no polling.

## 3. Audit Framework

Implementation: `packages/agent-kernel/src/audit.ts`.

- **Append-only, hash-chained per tenant**: `hash = SHA-256(previousHash +
  canonicalJson(event))`. `verifyChain()` recomputes the chain and reports the
  first broken sequence; surfaced in the UI and at `/api/v1/audit/verify`.
- **Captured kinds**: agent decisions (with prompt/LLM/knowledge versions and
  evidence), workflow lifecycle (started/step/completed/failed/rolled-back),
  approval requested/resolved (with approver + comments), JIRA syncs (inputs,
  outputs, conflicts), knowledge updates, feedback, configuration changes,
  notifications — each linked to story / release / deployment subjects.
- **Compliance export**: NDJSON download (`/api/v1/audit/export`); the
  hash chain makes the export independently verifiable.
- **Retention**: append-only store with UPDATE/DELETE revoked at the database
  role level; 7-year default retention, litigation hold flag per tenant.

## 4. Feedback → learning loop

Every recommendation accepts reviewer feedback (`ACCEPTED / REJECTED /
MODIFIED` + comments + learning outcome). Feedback is (a) audited, (b)
re-ingested into long-term memory so future retrieval sees prior outcomes, and
(c) aggregated into the acceptance-rate signal on the compliance and AI-health
metrics. Implementation: `packages/agent-kernel/src/feedback.ts`.

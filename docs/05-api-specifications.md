# API Specifications

Base URL: `/api/v1`. All endpoints are tenant-scoped. Authentication: OAuth2 /
OIDC bearer tokens at the gateway (demo mode: `Authorization: Bearer
demo-<userId>`). Errors: `{ "error": string }` with conventional status codes.
Implementation: `apps/api/src/server.ts`; exercised by `apps/api/test/api.test.ts`.

## REST endpoints

### Health & administration
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness/readiness |
| GET | `/api/v1/tenant` | Tenant profile + settings (threshold, LLM provider/model, residency, regulatory profiles) |
| GET | `/api/v1/users` | Users and roles |
| GET | `/api/v1/events` | Recent platform events (event bus tail) |
| GET | `/api/v1/events/stream` | **Server-Sent Events**: live bridge of the event bus (all `workflow.*`, `approval.*`, `jira.*`, `knowledge.*` topics; 15s heartbeats) |

### Dashboards & metrics
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/dashboard` | Home dashboard snapshot (12 signals + trends) |
| GET | `/api/v1/metrics/squad` | Squad dashboard metrics |
| GET | `/api/v1/metrics/leadership` | Senior leadership metrics |
| GET | `/api/v1/metrics/predictions` | Eight AI predictions with drivers |

### Work management & JIRA
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/sprints` / `/sprints/current` | Sprints; current sprint + items |
| GET | `/api/v1/backlog` | Backlog stories |
| GET | `/api/v1/stories` / `/stories/:id` | All items; item + decisions + runs + executions |
| GET | `/api/v1/jira/status` | Connection + sync history |
| POST | `/api/v1/jira/sync` | `{mode: AUTO\|MANUAL\|SCHEDULED\|INCREMENTAL}` → SyncResult (pulled/updated/pushed/conflicts) |

### Agents & workflows
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/agents` / `/agents/:id` / `/agents/health` | Catalog, agent detail, health board |
| GET | `/api/v1/workflows` | Workflow definitions (5 phases) |
| POST | `/api/v1/workflows/:id/start` | `{subjectId, detached?}` → WorkflowRun. `detached: true` returns immediately; progress streams via SSE / polling |
| GET | `/api/v1/runs` / `/runs/:id` / `/runs/:id/diagram` | Runs; run detail; mermaid visualisation |
| POST | `/api/v1/runs/:id/pause` `/resume` `/rollback` | Orchestrator controls |

### Governance
| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/decisions?subjectId=` / `/decisions/:id` | Governance envelopes |
| GET | `/api/v1/approvals?status=` / `/approvals/matrix` | Approval queue; role matrix |
| POST | `/api/v1/approvals/:id/resolve` | `{status, comment}` — role-checked against the matrix |
| GET | `/api/v1/audit?subjectId=&limit=` | Audit query |
| GET | `/api/v1/audit/verify` | Hash-chain integrity check |
| GET | `/api/v1/audit/export` | NDJSON compliance export |
| GET/POST | `/api/v1/feedback` | Recommendation feedback loop |

### Knowledge
| Method | Path | Description |
|---|---|---|
| GET/POST | `/api/v1/knowledge` | List / ingest documents |
| POST | `/api/v1/knowledge/search` | `{query, topK}` → semantic hits with scores |

## Event topics (async contract)

| Topic | Payload | Emitted by |
|---|---|---|
| `workflow.started/completed/failed/rolled_back` | `{runId, stepId?}` | orchestrator |
| `workflow.step.started` | `{runId, stepId, agentId}` | orchestrator |
| `workflow.step.completed` | `{runId, stepId, decisionId}` | orchestrator |
| `approval.requested/resolved` | `{approvalId, type/status}` | approval service |
| `jira.sync.completed` | `{syncId}` | JIRA sync |
| `knowledge.updated` | `{documentId}` | knowledge manager |

In production these topics map 1:1 onto Kafka/NATS subjects; webhooks fan out
to Slack/Teams via the Notification Manager agent.

## GraphQL (read gateway, planned surface)

```graphql
type Query {
  story(id: ID!): Story
  sprint(current: Boolean): Sprint
  decisions(subjectId: ID!): [AgentDecision!]!
  traceability(storyId: ID!): TraceGraph!   # knowledge-graph projection
  dashboard: DashboardSnapshot!
}
type Story {
  id: ID! jiraKey: String! title: String! stage: String!
  acceptanceCriteria: [AcceptanceCriterion!]!
  scenarios: [GherkinScenario!]!
  decisions: [AgentDecision!]!
  runs: [WorkflowRun!]!
}
```

The REST surface is the system of record; GraphQL composes it for UI-shaped
reads (traceability views), never for mutations.

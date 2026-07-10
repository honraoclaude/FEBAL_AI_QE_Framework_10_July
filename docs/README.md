# QE.ai — Documentation Index

QE.ai is the **AI Operating System for Quality Engineering**: a multi-tenant SaaS
platform that orchestrates AI agents across the complete SDLC for Salesforce
ecosystems, with enterprise governance, human approval, immutable audit and
continuous learning.

## Deliverable map

| # | Deliverable | Where |
|---|---|---|
| 1 | Product Vision | [01-product-vision-and-requirements.md](01-product-vision-and-requirements.md) |
| 2 | Functional Requirements | [01-product-vision-and-requirements.md](01-product-vision-and-requirements.md) |
| 3 | Non-Functional Requirements | [01-product-vision-and-requirements.md](01-product-vision-and-requirements.md) |
| 4 | Agent Architecture | [02-agent-architecture.md](02-agent-architecture.md) |
| 5 | Workflow Diagrams | [03-workflows-and-sequences.md](03-workflows-and-sequences.md) |
| 6 | Sequence Diagrams | [03-workflows-and-sequences.md](03-workflows-and-sequences.md) |
| 7 | UI/UX Wireframes | [06-ui-ux-designs.md](06-ui-ux-designs.md) |
| 8 | Database Schema | [04-data-architecture.md](04-data-architecture.md) |
| 9 | Knowledge Graph | [04-data-architecture.md](04-data-architecture.md) |
| 10 | Vector Database Design | [04-data-architecture.md](04-data-architecture.md) |
| 11 | API Specifications | [05-api-specifications.md](05-api-specifications.md) |
| 12 | Prompt Library | [02-agent-architecture.md](02-agent-architecture.md) + `packages/agents/src/prompts.ts` |
| 13 | Agent Memory Design | [02-agent-architecture.md](02-agent-architecture.md) |
| 14 | Multi-Agent Communication | [02-agent-architecture.md](02-agent-architecture.md) |
| 15 | Governance Framework | [07-governance-approvals-audit.md](07-governance-approvals-audit.md) |
| 16 | Human Approval Framework | [07-governance-approvals-audit.md](07-governance-approvals-audit.md) |
| 17 | Audit Framework | [07-governance-approvals-audit.md](07-governance-approvals-audit.md) |
| 18 | Security Architecture | [08-security-architecture.md](08-security-architecture.md) |
| 19 | Multi-Tenant SaaS Architecture | [09-saas-and-deployment-architecture.md](09-saas-and-deployment-architecture.md) |
| 20 | Deployment Architecture | [09-saas-and-deployment-architecture.md](09-saas-and-deployment-architecture.md) |
| 21 | CI/CD Architecture | [09-saas-and-deployment-architecture.md](09-saas-and-deployment-architecture.md) + `.github/workflows/ci.yml` |
| 22 | Kubernetes Deployment | [09-saas-and-deployment-architecture.md](09-saas-and-deployment-architecture.md) + `infra/k8s/` |
| 23 | Complete Folder Structure | [09-saas-and-deployment-architecture.md](09-saas-and-deployment-architecture.md) |
| 24 | Technology Stack | [09-saas-and-deployment-architecture.md](09-saas-and-deployment-architecture.md) |
| 25–28 | Roadmaps (Development, MVP, Enterprise, AI Maturity) | [10-roadmaps-and-implementation.md](10-roadmaps-and-implementation.md) |
| 29 | Platform User Stories | [01-product-vision-and-requirements.md](01-product-vision-and-requirements.md) |
| 30–33 | UX Designs, Figma-ready Wireframes, Component Library, Dashboard Designs | [06-ui-ux-designs.md](06-ui-ux-designs.md) |
| 34 | Agent Health Dashboard | [06-ui-ux-designs.md](06-ui-ux-designs.md) + `apps/web/src/pages/Agents.tsx` |
| 35 | Complete Implementation Plan | [10-roadmaps-and-implementation.md](10-roadmaps-and-implementation.md) |
| — | Feature Enhancement Backlog (ENH-01…25) | [11-feature-enhancements.md](11-feature-enhancements.md) |

## Running the product

```bash
npm install
npm run dev:api     # API on :4000 (deterministic demo mode without ANTHROPIC_API_KEY)
npm run dev:web     # UI on :5173 (proxies /api to :4000)
npm test            # 30 tests across kernel, agents, API
docker compose up   # containerised: web on :8080, api on :4000
```

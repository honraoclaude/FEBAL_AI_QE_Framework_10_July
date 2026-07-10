# Security Architecture

## 1. Identity & access

| Control | Design |
|---|---|
| Authentication | OAuth 2.0 / OIDC at the API gateway; SAML 2.0 + SSO (Okta, Entra ID) for enterprise tenants; SCIM provisioning. Demo mode uses labelled bearer stand-ins (`apps/api/src/server.ts`) behind the same seam. |
| RBAC | 11 platform roles (PO, BA, Developer, QA, QE Lead, Architect, Security Lead, Compliance Officer, Release Manager, Engineering Manager, Admin); server-side enforcement at approval resolution and admin surfaces. |
| ABAC | Attribute rules layered on RBAC: tenant, data residency, regulatory profile, subject sensitivity (e.g. only Compliance Officers in the tenant's residency region may approve COMPLIANCE artefacts). |
| Service identity | mTLS between services (K8s + service mesh); workload identity to cloud services — no static credentials in pods. |

## 2. Data protection

- **In transit:** TLS 1.3 everywhere; HSTS at the edge.
- **At rest:** AES-256 (cloud KMS-managed keys); per-tenant envelope keys for
  ENTERPRISE plan (crypto-shredding on offboarding).
- **Tenant isolation:** row-level security on every table + optional dedicated
  schema; per-tenant vector partitions and knowledge versioning; per-tenant
  token budgets on LLM spend.
- **Secrets:** cloud secrets manager (Vault/ASM); JIRA OAuth tokens and LLM
  keys never persist in application tables (`JiraConnection` stores client id
  only); rotation policies enforced by the Security Governance agent.
- **GDPR:** data residency per tenant (UK/EU/US), DSAR export via audit +
  work-item stores, PII minimisation in prompts (masking before LLM calls),
  synthetic data generation for test environments.

## 3. AI-specific security

| Threat | Mitigation |
|---|---|
| Prompt injection via story text | Story content is data, never instructions: prompts template it into delimited context; deterministic layer is authoritative for gate outcomes |
| Data exfiltration through LLM | Provider allow-list per tenant; PII masking; no cross-tenant context; zero-retention agreements with providers |
| Model drift / silent degradation | LLM Performance Analyzer tracks quality/latency; prompt versions pinned per decision enable regression analysis |
| Over-trusted automation | Gatekeepers + confidence thresholds + mandatory human approval matrix; agents cannot self-approve |
| Audit tampering | Hash-chained append-only trail; UPDATE/DELETE revoked; chain verification endpoint |

## 4. Application & platform security

- OWASP ASVS-aligned SDLC; the platform's own Secure Coding / Security Testing
  agents run on the platform's codebase (self-hosting quality).
- Dependency and container scanning in CI; images run as non-root with
  read-only root filesystems; K8s `securityContext` enforced (see `infra/k8s`).
- Network policy: default-deny between namespaces; egress restricted to JIRA,
  Git hosts, Salesforce and the LLM provider.
- Rate limiting + WAF at the gateway; audit of every admin action.

## 5. Compliance posture

- **SOC 2 Type II** control mapping: change management (approval matrix +
  audit), logical access (RBAC/ABAC + SSO), monitoring (OTel + incident
  agents), confidentiality (encryption + isolation).
- **ISO 27001** Annex A coverage via the same control set; Statement of
  Applicability maintained per release.
- **FCA / Consumer Duty:** not just platform compliance — compliance evidence
  is a product feature (regulated-scenario tagging, evidence capture,
  exportable trail).

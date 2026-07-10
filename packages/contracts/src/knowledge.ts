import type { TenantId } from './tenancy.js';

/** Knowledge platform: RAG documents, vector entries and knowledge-graph nodes. */

export type KnowledgeSource =
  | 'JIRA'
  | 'CONFLUENCE'
  | 'GITHUB'
  | 'AZURE_DEVOPS'
  | 'BITBUCKET'
  | 'SALESFORCE_METADATA'
  | 'PRODUCTION_INCIDENT'
  | 'RELEASE_NOTES'
  | 'ARCHITECTURE_DOC'
  | 'PAST_DEFECT'
  | 'PAST_TEST_CASE'
  | 'CONSUMER_DUTY'
  | 'FCA_GUIDANCE'
  | 'INTERNAL_STANDARD';

export interface KnowledgeDocument {
  id: string;
  tenantId: TenantId;
  source: KnowledgeSource;
  title: string;
  content: string;
  uri?: string;
  version: number;
  tags: string[];
  ingestedAt: string;
}

export interface VectorEntry {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
}

export interface KnowledgeGraphNode {
  id: string;
  tenantId: TenantId;
  kind:
    | 'STORY'
    | 'FEATURE'
    | 'EPIC'
    | 'TEST_CASE'
    | 'DEFECT'
    | 'RELEASE'
    | 'DEPLOYMENT'
    | 'SF_COMPONENT'
    | 'API'
    | 'REGULATION'
    | 'INCIDENT'
    | 'AGENT_DECISION';
  label: string;
  properties: Record<string, unknown>;
}

export interface KnowledgeGraphEdge {
  id: string;
  from: string;
  to: string;
  relation:
    | 'IMPLEMENTS'
    | 'TESTED_BY'
    | 'COVERS'
    | 'IMPACTS'
    | 'DEPENDS_ON'
    | 'CAUSED'
    | 'RESOLVED_BY'
    | 'RELEASED_IN'
    | 'REGULATED_BY'
    | 'LEARNED_FROM';
  properties?: Record<string, unknown>;
}

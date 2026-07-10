import type { KnowledgeDocument, VectorEntry } from '@qe-ai/contracts';
import { newId, nowIso, sha256 } from './util.js';

/**
 * Agent memory:
 *  - Working memory: per-workflow-run key/value context passed between steps.
 *  - Long-term memory: knowledge documents with vector retrieval (RAG).
 *
 * The vector store uses deterministic hash-based embeddings so retrieval works
 * offline; swap `embed` for a real embedding model + pgvector/Pinecone in production.
 */

const EMBEDDING_DIM = 64;

export function embed(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIM).fill(0);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const token of tokens) {
    const h = parseInt(sha256(token).slice(0, 8), 16);
    vector[h % EMBEDDING_DIM]! += 1;
  }
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) dot += a[i]! * b[i]!;
  return dot;
}

export class MemoryStore {
  private working = new Map<string, Record<string, unknown>>();
  private documents = new Map<string, KnowledgeDocument>();
  private vectors: VectorEntry[] = [];
  private knowledgeVersion = 1;

  // ---- working memory ----

  getWorkingMemory(runId: string): Record<string, unknown> {
    return this.working.get(runId) ?? {};
  }

  mergeWorkingMemory(runId: string, patch: Record<string, unknown>): Record<string, unknown> {
    const next = { ...this.getWorkingMemory(runId), ...patch };
    this.working.set(runId, next);
    return next;
  }

  clearWorkingMemory(runId: string): void {
    this.working.delete(runId);
  }

  // ---- long-term knowledge ----

  get version(): string {
    return `kb-v${this.knowledgeVersion}`;
  }

  ingest(doc: Omit<KnowledgeDocument, 'id' | 'version' | 'ingestedAt'>): KnowledgeDocument {
    const document: KnowledgeDocument = {
      ...doc,
      id: newId('doc'),
      version: this.knowledgeVersion,
      ingestedAt: nowIso(),
    };
    this.documents.set(document.id, document);

    const chunks = chunkText(document.content, 600);
    chunks.forEach((text, index) => {
      this.vectors.push({
        id: newId('vec'),
        documentId: document.id,
        chunkIndex: index,
        text,
        embedding: embed(text),
      });
    });
    this.knowledgeVersion += 1;
    return document;
  }

  retrieve(tenantId: string, query: string, topK = 5): Array<{ document: KnowledgeDocument; chunk: string; score: number }> {
    const queryVector = embed(query);
    return this.vectors
      .map((entry) => ({ entry, score: cosine(queryVector, entry.embedding) }))
      .sort((a, b) => b.score - a.score)
      .map(({ entry, score }) => ({ document: this.documents.get(entry.documentId)!, chunk: entry.text, score }))
      .filter(({ document }) => document && document.tenantId === tenantId)
      .slice(0, topK);
  }

  listDocuments(tenantId: string): KnowledgeDocument[] {
    return [...this.documents.values()].filter((d) => d.tenantId === tenantId);
  }
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks.length > 0 ? chunks : [text];
}

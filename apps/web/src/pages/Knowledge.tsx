import { useState } from 'react';
import { api, useApi } from '../api';
import { ErrorNote } from '../components/common';
import type { KnowledgeDocument } from '../types';

interface SearchHit {
  document: KnowledgeDocument;
  chunk: string;
  score: number;
}

export function KnowledgePage() {
  const documents = useApi<KnowledgeDocument[]>('/api/v1/knowledge');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>();
  const [searching, setSearching] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      setHits(await api.post<SearchHit[]>('/api/v1/knowledge/search', { query, topK: 5 }));
    } finally {
      setSearching(false);
    }
  }

  if (documents.error) return <ErrorNote error={documents.error} />;

  return (
    <>
      <div className="card">
        <div className="section-title">Knowledge Centre</div>
        <div className="sub" style={{ marginTop: 4 }}>
          Continuously learning from JIRA, incidents, past defects, FCA guidance, Consumer Duty and internal standards. Retrieval feeds every agent decision
          (RAG).
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <input
            type="text"
            placeholder="Semantic search — e.g. multi-currency fee rounding"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            style={{ minWidth: 360 }}
          />
          <button className="btn primary" onClick={search} disabled={searching}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      {hits && (
        <div className="card">
          <h3>Search Results</h3>
          {hits.map((hit, i) => (
            <div key={i} className="decision" style={{ marginTop: 8 }}>
              <div className="row between">
                <strong style={{ fontSize: 13 }}>{hit.document.title}</strong>
                <span className="badge accent">score {hit.score.toFixed(2)}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{hit.chunk}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3>Knowledge Documents ({documents.data?.length ?? 0})</h3>
        <table className="data">
          <thead>
            <tr>
              <th>Title</th>
              <th>Source</th>
              <th>Tags</th>
              <th>Ingested</th>
            </tr>
          </thead>
          <tbody>
            {(documents.data ?? []).map((doc) => (
              <tr key={doc.id}>
                <td style={{ color: 'var(--text-primary)' }}>{doc.title}</td>
                <td>
                  <span className="badge">{doc.source.replaceAll('_', ' ')}</span>
                </td>
                <td>
                  {doc.tags.map((tag) => (
                    <span key={tag} className="badge" style={{ marginRight: 4 }}>
                      {tag}
                    </span>
                  ))}
                </td>
                <td style={{ fontSize: 12 }}>{new Date(doc.ingestedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

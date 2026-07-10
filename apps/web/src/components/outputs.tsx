import type { ReactNode } from 'react';

/**
 * Agent-specific output renderers. The renderer is selected by payload shape
 * (duck typing), so custom agents with the same contracts get rich rendering
 * for free; unknown shapes fall back to formatted JSON.
 */

function CheckBadge({ status }: { status: string }) {
  const cls = status === 'PASS' || status === 'GOOD' ? 'good' : status === 'WARN' || status === 'REVIEW' ? 'warning' : 'critical';
  return <span className={`badge ${cls}`}>{status}</span>;
}

function PassBadge({ pass }: { pass: boolean }) {
  return <span className={`badge ${pass ? 'good' : 'critical'}`}>{pass ? 'PASS' : 'FAIL'}</span>;
}

function ScorePill({ label, value, max = 1 }: { label: string; value: number; max?: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <span className="row" style={{ gap: 6 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      <span className="confidence-meter" style={{ width: 60 }}>
        <div style={{ width: `${pct}%`, background: pct >= 70 ? 'var(--status-good)' : pct >= 50 ? 'var(--status-warning)' : 'var(--status-critical)' }} />
      </span>
      <strong style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{max === 1 ? value.toFixed(2) : `${value}`}</strong>
    </span>
  );
}

function MiniTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <table className="data" style={{ marginTop: 6 }}>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, i) => (
          <tr key={i}>
            {cells.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---- payload shapes (duck-typed mirrors of @qe-ai/agents payloads) ----

interface AspectCheck { aspect: string; score: number; status: string; finding: string }
interface GateCheck { name: string; pass: boolean; detail: string }
interface Scenario { id: string; title: string; category: string; tags: string[]; given: string[]; when: string[]; then: string[]; automationCandidate: boolean }
interface AutomationRec { title: string; automate: boolean; roiScore: number; priority: string; framework: string; complexity: string; maintenanceCost: string }

export function DecisionOutput({ payload }: { payload: unknown }) {
  const p = payload as Record<string, unknown> | null;
  const rich = p && typeof p === 'object' ? renderRich(p) : null;
  if (rich === null) return <JsonFallback payload={payload} />;
  return (
    <>
      {rich}
      <details className="io" style={{ marginTop: 8 }}>
        <summary>
          Raw JSON <span className="io-hint">exact payload</span>
        </summary>
        <JsonFallback payload={payload} />
      </details>
    </>
  );
}

function JsonFallback({ payload }: { payload: unknown }) {
  const text = JSON.stringify(payload, null, 2) ?? 'null';
  return (
    <pre className="code" style={{ maxHeight: 260, overflow: 'auto', margin: '6px 0 0' }}>
      {text.length > 6000 ? `${text.slice(0, 6000)}\n… (truncated)` : text}
    </pre>
  );
}

function renderRich(p: Record<string, unknown>): ReactNode | null {
  // Story Analysis
  if (typeof p['definitionOfReadyScore'] === 'number') {
    const missing = (p['missingInformation'] as string[]) ?? [];
    const questions = (p['openQuestions'] as string[]) ?? [];
    const deps = (p['dependencies'] as string[]) ?? [];
    return (
      <div style={{ marginTop: 6 }}>
        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          <ScorePill label="Definition of Ready" value={p['definitionOfReadyScore'] as number} />
          <ScorePill label="Testability" value={p['testabilityScore'] as number} />
          <ScorePill label="Automation potential" value={p['automationPotential'] as number} />
          <span className="badge accent">complexity {String(p['complexity'])}</span>
          <CheckBadge status={String(p['businessRisk'])} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>business risk</span>
          <CheckBadge status={String(p['technicalRisk'])} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>technical risk</span>
        </div>
        <MiniTable
          head={['Aspect', 'Assessment']}
          rows={[
            ['Business summary', String(p['businessSummary'])],
            ['Problem statement', String(p['problemStatement'])],
            ['Business value', String(p['businessValue'])],
            ['Expected outcome', String(p['expectedOutcome'])],
            ['AC review', String(p['acceptanceCriteriaReview'])],
            ...(deps.length > 0 ? ([['Dependencies', deps.join('; ')]] as ReactNode[][]) : []),
            ...(missing.length > 0 ? ([['Missing information', <span key="m" style={{ color: 'var(--status-serious)' }}>{missing.join(' ')}</span>]] as ReactNode[][]) : []),
            ...(questions.length > 0 ? ([['Open questions', questions.join(' ')]] as ReactNode[][]) : []),
          ]}
        />
      </div>
    );
  }

  // Salesforce Impact
  if (Array.isArray(p['areas']) && (p['areas'] as Array<Record<string, unknown>>)[0]?.['area'] !== undefined) {
    const areas = p['areas'] as Array<{ area: string; impacted: boolean; rationale: string }>;
    const impacted = areas.filter((a) => a.impacted);
    return (
      <div style={{ marginTop: 6 }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {areas.map((a) => (
            <span key={a.area} className={`badge ${a.impacted ? 'serious' : ''}`} title={a.rationale}>
              {a.impacted ? '● ' : '○ '}
              {a.area}
            </span>
          ))}
        </div>
        <MiniTable
          head={['Impacted Area', 'Why']}
          rows={impacted.map((a) => [a.area, a.rationale])}
        />
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
          <strong>Regression scope:</strong> {((p['regressionScope'] as string[]) ?? []).join(' · ')}
        </div>
        {((p['metadataDependencies'] as string[]) ?? []).length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            <strong>Metadata dependencies:</strong> {(p['metadataDependencies'] as string[]).join(' · ')}
          </div>
        )}
      </div>
    );
  }

  // Three Amigos
  if (p['invest'] && typeof p['invest'] === 'object') {
    const invest = p['invest'] as Record<string, { pass: boolean; note: string }>;
    const smart = (p['smart'] as Record<string, boolean>) ?? {};
    const actions = (p['actions'] as Array<{ role: string; action: string }>) ?? [];
    return (
      <div style={{ marginTop: 6 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className={`badge ${p['verdict'] === 'APPROVED' ? 'good' : 'warning'}`}>{String(p['verdict'])}</span>
          <span className={`badge ${p['definitionOfReadyPass'] ? 'good' : 'critical'}`}>DoR {p['definitionOfReadyPass'] ? 'pass' : 'fail'}</span>
          {Object.entries(smart).map(([k, v]) => (
            <span key={k} className={`badge ${v ? 'good' : 'critical'}`}>{k}</span>
          ))}
        </div>
        <MiniTable
          head={['INVEST', 'Result', 'Note']}
          rows={Object.entries(invest).map(([k, v]) => [k, <PassBadge key={k} pass={v.pass} />, v.note])}
        />
        {actions.length > 0 && (
          <MiniTable head={['Owner', 'Action']} rows={actions.map((a) => [<span key={a.role} className="badge accent">{a.role}</span>, a.action])} />
        )}
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
          <strong>Edge cases:</strong> {((p['edgeCases'] as string[]) ?? []).join(' · ')}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          <strong>NFR coverage:</strong> {((p['nfrCoverage'] as string[]) ?? []).join(' · ')}
        </div>
      </div>
    );
  }

  // FCA
  if (Array.isArray(p['complianceRisks'])) {
    const risks = p['complianceRisks'] as string[];
    const applicable = Boolean(p['applicable']);
    return (
      <div style={{ marginTop: 6 }}>
        <span className={`badge ${applicable ? 'serious' : 'good'}`}>{applicable ? 'FCA obligations triggered' : 'No FCA obligations'}</span>
        {risks.length > 0 && (
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)' }}>
            {risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
        <MiniTable
          head={['Dimension', 'Assessment']}
          rows={[
            ['Operational resilience', String(p['operationalResilience'])],
            ['Financial promotions', String(p['financialPromotions'])],
            ['Consumer protection', String(p['consumerProtection'])],
            ['Governance', String(p['governance'])],
            ...(((p['evidenceRequired'] as string[]) ?? []).length > 0 ? ([['Evidence required', (p['evidenceRequired'] as string[]).join('; ')]] as ReactNode[][]) : []),
            ...(((p['mandatoryActions'] as string[]) ?? []).length > 0 ? ([['Mandatory actions', <span key="a" style={{ color: 'var(--status-serious)' }}>{(p['mandatoryActions'] as string[]).join('; ')}</span>]] as ReactNode[][]) : []),
          ]}
        />
      </div>
    );
  }

  // Consumer Duty
  if (p['outcomes'] && typeof p['outcomes'] === 'object' && (p['outcomes'] as Record<string, unknown>)['productsAndServices']) {
    const outcomes = p['outcomes'] as Record<string, { rating: string; note: string }>;
    const labels: Record<string, string> = {
      productsAndServices: 'Products & services',
      priceAndValue: 'Price & value',
      consumerUnderstanding: 'Consumer understanding',
      consumerSupport: 'Consumer support',
    };
    return (
      <div style={{ marginTop: 6 }}>
        <MiniTable
          head={['Outcome', 'Rating', 'Note']}
          rows={Object.entries(outcomes).map(([k, v]) => [labels[k] ?? k, <CheckBadge key={k} status={v.rating} />, v.note])}
        />
        <MiniTable
          head={['Dimension', 'Assessment']}
          rows={[
            ['Vulnerable customers', String(p['vulnerableCustomers'])],
            ['Fair journey', String(p['fairJourney'])],
            ...(((p['recommendedActions'] as string[]) ?? []).length > 0 ? ([['Recommended actions', (p['recommendedActions'] as string[]).join('; ')]] as ReactNode[][]) : []),
          ]}
        />
      </div>
    );
  }

  // BDD pack
  if (Array.isArray(p['scenarios']) && (p['scenarios'] as Scenario[])[0]?.given !== undefined) {
    const scenarios = p['scenarios'] as Scenario[];
    const byCategory = new Map<string, number>();
    for (const s of scenarios) byCategory.set(s.category, (byCategory.get(s.category) ?? 0) + 1);
    return (
      <div style={{ marginTop: 6 }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {[...byCategory.entries()].map(([category, count]) => (
            <span key={category} className="badge accent">
              {category.replaceAll('_', ' ')} × {count}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
          {scenarios.map((s) => (
            <details key={s.id} className="io" style={{ marginTop: 0 }}>
              <summary>
                {s.title}
                <span className="io-hint">
                  {s.automationCandidate ? '🤖 ' : ''}
                  {s.tags.join(' ')}
                </span>
              </summary>
              <pre className="code" style={{ margin: '6px 0 0' }}>
                <span style={{ color: 'var(--series-5)' }}>{s.tags.join(' ')}</span>
                {'\n'}
                <span style={{ color: 'var(--series-3)' }}>Scenario:</span> {s.title}
                {s.given.map((g, i) => `\n  ${i === 0 ? 'Given' : 'And'} ${g}`).join('')}
                {s.when.map((w, i) => `\n  ${i === 0 ? 'When' : 'And'} ${w}`).join('')}
                {s.then.map((t, i) => `\n  ${i === 0 ? 'Then' : 'And'} ${t}`).join('')}
              </pre>
            </details>
          ))}
        </div>
      </div>
    );
  }

  // Automation plan
  if (Array.isArray(p['recommendations']) && typeof p['automationPercent'] === 'number') {
    const recs = p['recommendations'] as AutomationRec[];
    return (
      <div style={{ marginTop: 6 }}>
        <span className="badge accent">{String(p['automationPercent'])}% recommended for automation</span>
        <MiniTable
          head={['Scenario', 'Automate', 'ROI', 'Priority', 'Framework', 'Complexity']}
          rows={recs.map((r) => [
            <span key="t" style={{ fontSize: 12 }}>{r.title}</span>,
            <PassBadge key="a" pass={r.automate} />,
            <span key="r" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.roiScore.toFixed(2)}</span>,
            <span key="p" className={`badge ${r.priority === 'P1' ? 'serious' : r.priority === 'P2' ? 'warning' : ''}`}>{r.priority}</span>,
            r.framework,
            r.complexity,
          ])}
        />
      </div>
    );
  }

  // Gate results (refinement gatekeeper shape)
  if (Array.isArray(p['checks']) && (p['checks'] as GateCheck[])[0]?.name !== undefined) {
    const checks = p['checks'] as GateCheck[];
    return (
      <div style={{ marginTop: 6 }}>
        <span className={`badge ${p['passed'] ? 'good' : 'critical'}`}>{p['passed'] ? 'GATE PASSED' : 'GATE BLOCKED'}</span>
        <MiniTable head={['Check', 'Result', 'Detail']} rows={checks.map((c) => [c.name, <PassBadge key={c.name} pass={c.pass} />, c.detail])} />
      </div>
    );
  }

  // Heuristic aspect evaluation (breadth of the catalog)
  if (Array.isArray(p['checks']) && (p['checks'] as AspectCheck[])[0]?.aspect !== undefined) {
    const checks = p['checks'] as AspectCheck[];
    return (
      <div style={{ marginTop: 6 }}>
        <div className="row" style={{ gap: 10 }}>
          {typeof p['score'] === 'number' && <ScorePill label="Composite score" value={p['score'] as number} />}
          {'passed' in p && <span className={`badge ${p['passed'] ? 'good' : 'critical'}`}>{p['passed'] ? 'PASSED' : 'REMEDIATION REQUIRED'}</span>}
        </div>
        <MiniTable
          head={['Aspect', 'Score', 'Status', 'Finding']}
          rows={checks.map((c) => [
            c.aspect,
            <span key="s" style={{ fontVariantNumeric: 'tabular-nums' }}>{c.score.toFixed(2)}</span>,
            <CheckBadge key="b" status={c.status} />,
            <span key="f" style={{ fontSize: 12 }}>{c.finding}</span>,
          ])}
        />
      </div>
    );
  }

  return null;
}

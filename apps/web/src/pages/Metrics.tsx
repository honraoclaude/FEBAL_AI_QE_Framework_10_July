import { useApi } from '../api';
import { LineChart, Meter } from '../components/charts';
import { ErrorNote, StatTile } from '../components/common';
import type { LeadershipMetrics, Prediction, SquadMetrics } from '../types';

export function MetricsPage() {
  const squad = useApi<SquadMetrics>('/api/v1/metrics/squad');
  const leadership = useApi<LeadershipMetrics>('/api/v1/metrics/leadership');
  const predictions = useApi<Prediction[]>('/api/v1/metrics/predictions');

  if (squad.error) return <ErrorNote error={squad.error} />;
  const s = squad.data;
  const l = leadership.data;

  return (
    <>
      <div className="section-title">Squad Dashboard</div>
      {s && (
        <>
          <div className="grid cols-4">
            <StatTile label="Sprint Quality" value={<Meter value={s.sprintQuality} />} />
            <StatTile label="Automation" value={`${s.automationPercent}%`} />
            <StatTile label="Defect Leakage" value={`${s.defectLeakage}%`} badge={<span className="badge good">↓ improving</span>} />
            <StatTile label="Escaped Defects" value={s.escapedDefects} />
          </div>
          <div className="grid cols-4">
            <StatTile label="Regression Coverage" value={`${s.regressionCoverage}%`} />
            <StatTile label="Lead Time" value={s.leadTimeDays} unit="days" />
            <StatTile label="Cycle Time" value={s.cycleTimeDays} unit="days" />
            <StatTile label="MTTR" value={s.mttrHours} unit="hours" />
          </div>
          <div className="card">
            <h3>Test Execution Trend</h3>
            <LineChart series={[{ name: 'Executions per week', points: s.executionTrend }]} />
          </div>
        </>
      )}

      <div className="section-title">Senior Leadership Dashboard</div>
      {l && (
        <>
          <div className="grid cols-4">
            <StatTile label="Quality Maturity" value={l.qualityMaturity} unit="/5" />
            <StatTile label="Cost of Quality" value={`$${(l.costOfQualityUsd / 1000).toFixed(0)}k`} />
            <StatTile label="Automation ROI" value={`${l.automationRoiPercent}%`} badge={<span className="badge good">positive</span>} />
            <StatTile label="AI Adoption" value={`${l.aiAdoptionPercent}%`} />
          </div>
          <div className="grid cols-4">
            <StatTile label="Release Success" value={`${l.releaseSuccessPercent}%`} />
            <StatTile label="Production Stability" value={`${l.productionStability}%`} />
            <StatTile label="Compliance Health" value={<Meter value={l.complianceHealth} />} />
            <StatTile label="Technical Debt" value={l.technicalDebtDays} unit="days" badge={<span className="badge good">↓ reducing</span>} />
          </div>
          <div className="card">
            <h3>Quality Trend (12 weeks)</h3>
            <LineChart series={[{ name: 'Quality score', points: l.qualityTrend }]} />
          </div>
        </>
      )}

      <div className="section-title">AI Predictions</div>
      <div className="grid cols-2">
        {(predictions.data ?? []).map((prediction) => (
          <div key={prediction.id} className="card">
            <div className="row between">
              <h3>{prediction.kind.replaceAll('_', ' ')}</h3>
              <span className={`badge ${prediction.probability > 0.5 ? 'serious' : prediction.probability > 0.3 ? 'warning' : 'good'}`}>
                {Math.round(prediction.probability * 100)}% probability
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>{prediction.narrative}</div>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-muted)' }}>
              {prediction.drivers.map((driver, i) => (
                <li key={i}>{driver}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

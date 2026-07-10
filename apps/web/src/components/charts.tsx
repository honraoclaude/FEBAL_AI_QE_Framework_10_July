import { useRef, useState } from 'react';
import type { TrendPoint } from '../types';

/**
 * Hand-rolled SVG charts following the platform's chart conventions:
 * thin marks, recessive grid, hover crosshair + tooltip, text in ink tokens.
 */

const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-5)'];

export function LineChart({
  series,
  height = 180,
  unit = '',
}: {
  series: Array<{ name: string; points: TrendPoint[] }>;
  height?: number;
  unit?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const width = 560;
  const pad = { top: 12, right: 12, bottom: 24, left: 36 };

  const all = series.flatMap((s) => s.points.map((p) => p.value));
  if (all.length === 0) return <div className="empty">No data</div>;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const lo = min - span * 0.1;
  const hi = max + span * 0.1;
  const n = Math.max(...series.map((s) => s.points.length));

  const x = (i: number) => pad.left + (i / Math.max(n - 1, 1)) * (width - pad.left - pad.right);
  const y = (v: number) => pad.top + (1 - (v - lo) / (hi - lo)) * (height - pad.top - pad.bottom);

  const ticks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1];

  function onMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    const index = Math.round(((px - pad.left) / (width - pad.left - pad.right)) * (n - 1));
    if (index >= 0 && index < n) {
      setHover({ index, x: ((x(index) / width) * rect.width), y: event.clientY - rect.top });
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', display: 'block' }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={series.map((s) => s.name).join(', ')}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={pad.left - 6} y={y(t) + 4} fontSize={10} fill="var(--text-muted)" textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(t)}
            </text>
          </g>
        ))}
        <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} stroke="var(--baseline)" strokeWidth={1} />
        {series[0]?.points.map((p, i) =>
          i % Math.ceil(n / 8) === 0 ? (
            <text key={i} x={x(i)} y={height - 8} fontSize={10} fill="var(--text-muted)" textAnchor="middle">
              {p.label}
            </text>
          ) : null,
        )}
        {hover && <line x1={x(hover.index)} x2={x(hover.index)} y1={pad.top} y2={height - pad.bottom} stroke="var(--baseline)" strokeWidth={1} strokeDasharray="3 3" />}
        {series.map((s, si) => {
          const color = SERIES[si % SERIES.length]!;
          const path = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
          return (
            <g key={s.name}>
              <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {hover && s.points[hover.index] && (
                <circle cx={x(hover.index)} cy={y(s.points[hover.index]!.value)} r={4} fill={color} stroke="var(--surface-1)" strokeWidth={2} />
              )}
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="chart-tooltip" style={{ left: hover.x, top: hover.y - 8 }}>
          <strong>{series[0]?.points[hover.index]?.label}</strong>
          {series.map((s, si) => (
            <div key={s.name}>
              <span className="key" style={{ background: SERIES[si % SERIES.length], display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginRight: 5 }} />
              {s.name}: {s.points[hover.index]?.value}
              {unit}
            </div>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div className="legend">
          {series.map((s, si) => (
            <span key={s.name}>
              <span className="key" style={{ background: SERIES[si % SERIES.length] }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sparkline({ points, color = 'var(--series-1)' }: { points: TrendPoint[]; color?: string }) {
  const width = 120;
  const height = 34;
  if (points.length === 0) return null;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (i / Math.max(points.length - 1, 1)) * (width - 4) + 2;
  const y = (v: number) => 2 + (1 - (v - min) / span) * (height - 8);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
  const last = points[points.length - 1]!;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(points.length - 1)} cy={y(last.value)} r={3} fill={color} stroke="var(--surface-1)" strokeWidth={1.5} />
    </svg>
  );
}

export function Meter({ value, label, color }: { value: number; label?: string; color?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const resolved = color ?? (clamped >= 80 ? 'var(--status-good)' : clamped >= 55 ? 'var(--status-warning)' : 'var(--status-critical)');
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={64} height={64} viewBox="0 0 64 64" role="img" aria-label={`${label ?? 'score'}: ${clamped}`}>
        <circle cx={32} cy={32} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={6} />
        <circle
          cx={32}
          cy={32}
          r={r}
          fill="none"
          stroke={resolved}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * c} ${c}`}
          transform="rotate(-90 32 32)"
        />
        <text x={32} y={37} textAnchor="middle" fontSize={15} fontWeight={700} fill="var(--text-primary)">
          {Math.round(clamped)}
        </text>
      </svg>
      {label && <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 90 }}>{label}</div>}
    </div>
  );
}

export function ProgressBar({
  segments,
  total,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  total: number;
}) {
  return (
    <div>
      <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-3)', gap: 2 }}>
        {segments.map((segment) =>
          segment.value > 0 ? (
            <div
              key={segment.label}
              title={`${segment.label}: ${segment.value}`}
              style={{ width: `${(segment.value / Math.max(total, 1)) * 100}%`, background: segment.color }}
            />
          ) : null,
        )}
      </div>
      <div className="legend">
        {segments.map((segment) => (
          <span key={segment.label}>
            <span className="key" style={{ background: segment.color }} />
            {segment.label} · {segment.value}
          </span>
        ))}
      </div>
    </div>
  );
}

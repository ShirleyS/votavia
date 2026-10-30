import { CATEGORY_COLORS, CATEGORY_SHORT_LABELS } from "@/lib/government/display";
import type { CaseCategory, CategoryCount } from "@/lib/government/types";

export function TrendChart({
  data,
  height = 190,
  compact = false,
}: {
  data: { label: string; received: number; resolved: number }[];
  height?: number;
  compact?: boolean;
}) {
  const width = 620;
  const pad = { top: 18, right: 16, bottom: 30, left: 34 };
  const max = Math.max(...data.flatMap((d) => [d.received, d.resolved]), 10);
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (index: number) => pad.left + (index / Math.max(data.length - 1, 1)) * innerW;
  const y = (value: number) => pad.top + innerH - (value / max) * innerH;
  const line = (key: "received" | "resolved") =>
    data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d[key])}`).join(" ");
  const area = `${line("received")} L ${x(data.length - 1)} ${pad.top + innerH} L ${x(0)} ${pad.top + innerH} Z`;
  return (
    <div className={`trend-chart ${compact ? "trend-chart--compact" : ""}`}>
      <div className="chart-legend">
        <span><i className="chart-legend__line chart-legend__line--blue" />Recibidos</span>
        <span><i className="chart-legend__line chart-legend__line--green" />Resueltos</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tendencia de reportes recibidos y resueltos">
        <defs>
          <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1453D8" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#1453D8" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((fraction) => (
          <line
            key={fraction}
            x1={pad.left}
            x2={width - pad.right}
            y1={pad.top + innerH * (1 - fraction)}
            y2={pad.top + innerH * (1 - fraction)}
            className="chart-gridline"
          />
        ))}
        {[0, 0.5, 1].map((fraction) => (
          <text
            key={fraction}
            x={pad.left - 10}
            y={pad.top + innerH * (1 - fraction) + 4}
            textAnchor="end"
            className="chart-axis-label"
          >
            {Math.round(max * fraction)}
          </text>
        ))}
        <path d={area} fill="url(#trend-area)" />
        <path d={line("received")} className="chart-line chart-line--blue" />
        <path d={line("resolved")} className="chart-line chart-line--green" />
        {data.map((d, index) => (
          <g key={d.label}>
            <circle cx={x(index)} cy={y(d.received)} r={3.2} className="chart-dot chart-dot--blue" />
            <circle cx={x(index)} cy={y(d.resolved)} r={2.8} className="chart-dot chart-dot--green" />
            <text x={x(index)} y={height - 8} textAnchor="middle" className="chart-axis-label">
              {d.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function CategoryBars({
  data,
  total,
}: {
  data: CategoryCount[];
  total?: number;
}) {
  const max = Math.max(...data.map((item) => item.count), 1);
  return (
    <div className="category-bars">
      {data.slice(0, 6).map((item) => (
        <div className="category-bar-row" key={item.category}>
          <span className="category-bar-row__label">
            {CATEGORY_SHORT_LABELS[item.category]}
          </span>
          <div className="category-bar-row__track">
            <span
              style={{
                width: `${Math.max(6, (item.count / max) * 100)}%`,
                background: CATEGORY_COLORS[item.category],
              }}
            />
          </div>
          <strong>{item.count}</strong>
        </div>
      ))}
      {total ? <p className="category-bars__note">{total} casos abiertos distribuidos en 6 categorías.</p> : null}
    </div>
  );
}

export function DonutChart({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: { label: string; value: number; color: string }[];
  centerValue: string;
  centerLabel: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  let cursor = 0;
  const gradient = segments
    .map((segment) => {
      const start = cursor;
      cursor += (segment.value / total) * 100;
      return `${segment.color} ${start}% ${cursor}%`;
    })
    .join(", ");
  return (
    <div className="donut-chart">
      <div
        className="donut-chart__ring"
        style={{ background: `conic-gradient(${gradient})` }}
        aria-hidden="true"
      >
        <div className="donut-chart__hole">
          <strong>{centerValue}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <div className="donut-chart__legend">
        {segments.map((segment) => (
          <span key={segment.label}>
            <i style={{ background: segment.color }} />
            {segment.label}
            <strong>{segment.value}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({
  values,
  color = "#1453D8",
  width = 92,
  height = 32,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / Math.max(max - min, 1)) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={width}
        cy={height - ((values[values.length - 1] - min) / Math.max(max - min, 1)) * (height - 4) - 2}
        r="2.5"
        fill={color}
      />
    </svg>
  );
}

export function HorizontalStackedBars({
  rows,
}: {
  rows: { label: string; total: number; segments: { label: string; value: number; color: string }[] }[];
}) {
  const max = Math.max(...rows.map((row) => row.total), 1);
  return (
    <div className="stacked-bars">
      {rows.map((row) => (
        <div className="stacked-bar-row" key={row.label}>
          <div className="stacked-bar-row__meta">
            <span>{row.label}</span>
            <strong>{row.total}</strong>
          </div>
          <div className="stacked-bar-row__track" style={{ width: `${Math.max(20, (row.total / max) * 100)}%` }}>
            {row.segments.map((segment) => (
              <span
                key={segment.label}
                title={`${segment.label}: ${segment.value}`}
                style={{
                  width: `${(segment.value / Math.max(row.total, 1)) * 100}%`,
                  background: segment.color,
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ComparisonBars({
  title,
  current,
  previous,
  currentLabel,
  previousLabel,
  categories,
}: {
  title: string;
  current: number;
  previous: number;
  currentLabel: string;
  previousLabel: string;
  categories: CaseCategory[];
}) {
  const max = Math.max(current, previous, 1);
  return (
    <div className="comparison-bars">
      <div className="comparison-bars__title">
        <strong>{title}</strong>
        <span>{categories.map((c) => CATEGORY_SHORT_LABELS[c]).join(" · ")}</span>
      </div>
      <div className="comparison-bars__row">
        <span>{currentLabel}</span>
        <div><i style={{ width: `${(current / max) * 100}%`, background: "#1453D8" }} /></div>
        <strong>{current}</strong>
      </div>
      <div className="comparison-bars__row">
        <span>{previousLabel}</span>
        <div><i style={{ width: `${(previous / max) * 100}%`, background: "#c8d4e8" }} /></div>
        <strong>{previous}</strong>
      </div>
    </div>
  );
}

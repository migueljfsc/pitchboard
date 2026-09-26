/**
 * The charts on the operator's page (D108). Hand-drawn SVG, like the board itself: a handful of
 * shapes does not justify a charting library, and nothing here is reused anywhere else.
 *
 * The colours and why are in `adminData.ts`. Text never wears a series colour.
 *
 * Every chart has a table view one click away, so no value is only reachable by hovering.
 */

import { useEffect, useRef, useState } from "react";

import { AMBER, DAY_S, shortDate } from "./adminData";

const SURFACE = "#111a17";
const GRID = "#1c2a25";
const AXIS = "#35473f";
const MUTED = "#6b807a";

/** Round, readable ticks: 0 and up to four steps of 1, 2 or 5 × 10ⁿ. */
function ticks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const unit = Math.max(1, step);
  const top = Math.ceil(max / unit) * unit;
  const out: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += unit) out.push(v);
  return out;
}

const fmt = (n: number) => n.toLocaleString();

// --- layout helpers ------------------------------------------------------------------------

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A column with a 4px rounded top and a square foot on the baseline. */
function columnPath(x: number, y: number, w: number, base: number): string {
  const h = base - y;
  if (h <= 0) return "";
  const r = Math.min(4, h, w / 2);
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

function Tooltip({ x, value, label, color }: { x: number; value: string; label: string; color: string }) {
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-ink-600 bg-ink-900 px-2 py-1 shadow-lg shadow-black/40"
      style={{ left: x }}
    >
      <div className="text-xs font-semibold whitespace-nowrap text-ink-200">{value}</div>
      <div className="flex items-center gap-1.5 text-[10px] whitespace-nowrap text-ink-400">
        <span className="inline-block h-0.5 w-2.5 rounded" style={{ background: color }} />
        {label}
      </div>
    </div>
  );
}

// --- the card ------------------------------------------------------------------------------

export function ChartCard({
  title,
  subtitle,
  table,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  /** The same numbers as rows: the chart's accessible twin. */
  table: Array<[string, string]>;
  className?: string;
  children: React.ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`rounded-lg border border-ink-700 bg-ink-800 p-4 ${className}`}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold text-ink-200">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11px] text-ink-500">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          className="shrink-0 rounded border border-ink-600 px-1.5 py-0.5 text-[10px] text-ink-400 transition hover:border-ink-400 hover:text-ink-200"
        >
          {asTable ? "Chart" : "Table"}
        </button>
      </header>
      {asTable ? (
        <div className="max-h-56 overflow-y-auto">
          <table className="w-full text-[11px]">
            <tbody>
              {table.map(([label, value]) => (
                <tr key={label} className="border-t border-ink-700 text-ink-300 first:border-t-0">
                  <td className="py-1 pr-3">{label}</td>
                  <td className="py-1 text-right tabular-nums">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

// --- columns -------------------------------------------------------------------------------

const PLOT_H = 140;
const AXIS_H = 20;
/** Room above the plot, so the top tick's label is not cut in half by the SVG's edge. */
const TOP = 8;
const LEFT = 32;

export function ColumnChart({
  values,
  labels,
  colors,
  unit,
}: {
  values: number[];
  labels: string[];
  /** One colour for every column, or one per column for an ordered ramp. */
  colors: string | readonly string[];
  unit: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const colorOf = (i: number) => (typeof colors === "string" ? colors : colors[i]);

  const grid = ticks(Math.max(...values, 0));
  const top = grid[grid.length - 1];
  const plotW = Math.max(0, width - LEFT);
  const band = values.length ? plotW / values.length : 0;
  const barW = Math.min(24, band * 0.7);
  const y = (v: number) => PLOT_H - (v / top) * PLOT_H;
  // Every label when they fit, else every other one, always keeping the newest.
  const every = band >= 44 ? 1 : band >= 22 ? 2 : 3;
  const showLabel = (i: number) => (values.length - 1 - i) % every === 0;

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={TOP + PLOT_H + AXIS_H} role="img" aria-label={`Column chart, ${unit}`}>
          <g transform={`translate(0,${TOP})`}>
            {grid.map((t) => (
              <g key={t}>
                <line x1={LEFT} x2={width} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth={1} />
                <text x={LEFT - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={MUTED} className="tabular-nums">
                  {fmt(t)}
                </text>
              </g>
            ))}
            {values.map((v, i) => {
              const x = LEFT + i * band + (band - barW) / 2;
              return (
                <g key={i}>
                  <path d={columnPath(x, y(v), barW, PLOT_H)} fill={colorOf(i)} opacity={hover === null || hover === i ? 1 : 0.55} />
                  {showLabel(i) && (
                    <text x={x + barW / 2} y={PLOT_H + 14} textAnchor="middle" fontSize={10} fill={MUTED}>
                      {labels[i]}
                    </text>
                  )}
                  {/* The whole band is the hit target, not the painted pixels. */}
                  <rect
                    x={LEFT + i * band}
                    y={0}
                    width={band}
                    height={PLOT_H}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${labels[i]}: ${fmt(v)} ${unit}`}
                    onPointerEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    className="outline-none"
                  />
                </g>
              );
            })}
          </g>
        </svg>
      )}
      {hover !== null && (
        <Tooltip
          x={LEFT + hover * band + band / 2}
          value={`${fmt(values[hover])} ${unit}`}
          label={labels[hover]}
          color={colorOf(hover)}
        />
      )}
    </div>
  );
}

// --- a cumulative line ---------------------------------------------------------------------

export function LineChart({ values, since, unit }: { values: number[]; since: number; unit: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const grid = ticks(Math.max(...values, 0));
  const top = grid[grid.length - 1];
  const right = 36; // room for the end label
  const plotW = Math.max(0, width - LEFT - right);
  const step = values.length > 1 ? plotW / (values.length - 1) : 0;
  const x = (i: number) => LEFT + i * step;
  const y = (v: number) => PLOT_H - (v / top) * PLOT_H;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("");
  const area = `${line}L${x(values.length - 1)},${PLOT_H}L${x(0)},${PLOT_H}Z`;
  const last = values.length - 1;
  const dateOf = (i: number) => shortDate(since + i * DAY_S);
  const axisDays = [0, Math.floor(last / 2), last];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round((e.clientX - box.left - LEFT) / (step || 1));
    setHover(Math.max(0, Math.min(last, i)));
  };

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
      {width > 0 && values.length > 0 && (
        <svg width={width} height={TOP + PLOT_H + AXIS_H} role="img" aria-label={`Line chart, ${unit}`} onPointerMove={onMove}>
          <g transform={`translate(0,${TOP})`}>
            {grid.map((t) => (
              <g key={t}>
                <line x1={LEFT} x2={width - right} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth={1} />
                <text x={LEFT - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={MUTED} className="tabular-nums">
                  {fmt(t)}
                </text>
              </g>
            ))}
            {axisDays.map((i, k) => (
              <text key={i} x={x(i)} y={PLOT_H + 14} fontSize={10} fill={MUTED} textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"}>
                {dateOf(i)}
              </text>
            ))}
            <path d={area} fill={AMBER} opacity={0.1} />
            <path d={line} fill="none" stroke={AMBER} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(last)} cy={y(values[last])} r={4} fill={AMBER} stroke={SURFACE} strokeWidth={2} />
            <text x={x(last) + 8} y={y(values[last])} dy="0.32em" fontSize={11} fontWeight={600} fill="#dde5e2">
              {fmt(values[last])}
            </text>
            {hover !== null && (
              <>
                <line x1={x(hover)} x2={x(hover)} y1={0} y2={PLOT_H} stroke={AXIS} strokeWidth={1} />
                <circle cx={x(hover)} cy={y(values[hover])} r={4} fill={AMBER} stroke={SURFACE} strokeWidth={2} />
              </>
            )}
          </g>
        </svg>
      )}
      {hover !== null && <Tooltip x={x(hover)} value={`${fmt(values[hover])} ${unit}`} label={dateOf(hover)} color={AMBER} />}
    </div>
  );
}

// --- part to whole -------------------------------------------------------------------------

export function StackedBar({ segments }: { segments: Array<{ label: string; value: number; color: string }> }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const total = segments.reduce((a, s) => a + s.value, 0);
  const shown = segments.map((s, i) => ({ ...s, i })).filter((s) => s.value > 0);
  const gap = 2;
  const usable = Math.max(0, width - gap * (shown.length - 1));
  const pct = (v: number) => (total ? `${Math.round((v / total) * 100)}%` : "0%");

  const widths = shown.map((s) => (s.value / total) * usable);
  const placed = shown.map((s, k) => ({
    ...s,
    w: widths[k],
    x: widths.slice(0, k).reduce((a, w) => a + w + gap, 0),
  }));

  return (
    <div>
      <div ref={ref} className="relative pt-12" onPointerLeave={() => setHover(null)}>
        {width > 0 && total > 0 && (
          <svg width={width} height={20} role="img" aria-label="Stacked bar">
            {placed.map((s, k) => {
              const first = k === 0;
              const lastSeg = k === placed.length - 1;
              return (
                <rect
                  key={s.label}
                  x={s.x}
                  y={0}
                  width={Math.max(0, s.w)}
                  height={20}
                  rx={first || lastSeg ? 4 : 0}
                  fill={s.color}
                  opacity={hover === null || hover === s.i ? 1 : 0.55}
                  tabIndex={0}
                  aria-label={`${s.label}: ${s.value}`}
                  onPointerEnter={() => setHover(s.i)}
                  onFocus={() => setHover(s.i)}
                  onBlur={() => setHover(null)}
                  className="outline-none"
                />
              );
            })}
          </svg>
        )}
        {total === 0 && <div className="h-5 rounded bg-ink-700" />}
        {hover !== null && (() => {
          const s = placed.find((p) => p.i === hover);
          return s ? (
            <Tooltip x={s.x + s.w / 2} value={`${fmt(s.value)} · ${pct(s.value)}`} label={s.label} color={s.color} />
          ) : null;
        })()}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5 text-[11px] text-ink-300">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
            <span className="font-semibold text-ink-200">{fmt(s.value)}</span>
            <span className="text-ink-500">{pct(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- sparkline -----------------------------------------------------------------------------

/** Trend only: no axes, no hover. The tile beside it carries the number. */
export function Sparkline({ values }: { values: number[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const h = 28;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const step = values.length > 1 ? (width - 8) / (values.length - 1) : 0;
  const pts = values.map((v, i) => [4 + i * step, h - 4 - ((v - min) / (max - min || 1)) * (h - 8)] as const);
  const last = pts[pts.length - 1];
  return (
    <div ref={ref} className="mt-2" aria-hidden>
      {width > 0 && last && (
        <svg width={width} height={h}>
          <path
            d={pts.map(([px, py], i) => `${i ? "L" : "M"}${px},${py}`).join("")}
            fill="none"
            stroke={AMBER}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.8}
          />
          <circle cx={last[0]} cy={last[1]} r={3} fill={AMBER} />
        </svg>
      )}
    </div>
  );
}

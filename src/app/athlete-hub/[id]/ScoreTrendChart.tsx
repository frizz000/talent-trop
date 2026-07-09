"use client";

import { useMemo, useRef, useState } from "react";

export type TrendPoint = { date: string; score: number };

const W = 640;
const H = 200;
const PAD = { top: 12, right: 12, bottom: 24, left: 34 };

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const rawStep = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rawStep) ?? mag * 10;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/**
 * Talent score history line chart — single series, crosshair + tooltip on hover.
 * Y domain is padded min/max of the data (not zero-based; line chart).
 */
export function ScoreTrendChart({ points }: { points: TrendPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { xs, ys, yMin, yMax, yTicks, xTickIdxs } = useMemo(() => {
    const scores = points.map((p) => p.score);
    const rawMin = Math.min(...scores);
    const rawMax = Math.max(...scores);
    const pad = Math.max((rawMax - rawMin) * 0.15, 0.5);
    const yMin = Math.max(0, rawMin - pad);
    const yMax = Math.min(100, rawMax + pad);
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const xs = points.map(
      (_, i) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
    );
    const ys = points.map(
      (p) => PAD.top + plotH - ((p.score - yMin) / (yMax - yMin || 1)) * plotH
    );
    const yTicks = niceTicks(yMin, yMax);
    // ~4 date labels, always including first and last
    const n = points.length;
    const xTickIdxs =
      n <= 4
        ? points.map((_, i) => i)
        : [0, Math.round(n / 3), Math.round((2 * n) / 3), n - 1];
    return { xs, ys, yMin, yMax, yTicks, xTickIdxs };
  }, [points]);

  if (points.length < 2) return null;

  const linePath = points.map((_, i) => `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${xs[xs.length - 1].toFixed(1)},${H - PAD.bottom} L${xs[0].toFixed(1)},${H - PAD.bottom} Z`;

  function yFor(v: number) {
    const plotH = H - PAD.top - PAD.bottom;
    return PAD.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
  }

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < xs.length; i++) {
      const d = Math.abs(xs[i] - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setHoverIdx(best);
  }

  const hover = hoverIdx != null ? points[hoverIdx] : null;
  const prev = hoverIdx != null && hoverIdx > 0 ? points[hoverIdx - 1] : null;
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "short" });

  // Tooltip flips side near the right edge
  const tooltipLeftPct =
    hoverIdx != null ? (xs[hoverIdx] / W) * 100 : 0;
  const flip = tooltipLeftPct > 68;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block", width: "100%", height: "auto" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label="Historia talent score"
      >
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a3e635" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#a3e635" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gridlines + y labels */}
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yFor(t)}
              y2={yFor(t)}
              stroke="var(--color-border)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 6}
              y={yFor(t) + 3}
              textAnchor="end"
              fontSize="9"
              fill="var(--color-muted)"
              fontFamily="var(--font-mono)"
            >
              {t}
            </text>
          </g>
        ))}

        {/* X date labels */}
        {xTickIdxs.map((i) => (
          <text
            key={i}
            x={xs[i]}
            y={H - 8}
            textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            fontSize="9"
            fill="var(--color-muted)"
            fontFamily="var(--font-mono)"
          >
            {fmtDate(points[i].date)}
          </text>
        ))}

        {/* Area + line */}
        <path d={areaPath} fill="url(#trend-fill)" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-trend-up)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Crosshair + hover point */}
        {hoverIdx != null && (
          <g>
            <line
              x1={xs[hoverIdx]}
              x2={xs[hoverIdx]}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--color-border-strong)"
              strokeWidth="1"
            />
            <circle
              cx={xs[hoverIdx]}
              cy={ys[hoverIdx]}
              r="4"
              fill="var(--color-trend-up)"
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {/* Tooltip */}
      {hover && hoverIdx != null && (
        <div
          className="absolute pointer-events-none px-2.5 py-1.5"
          style={{
            top: `${(ys[hoverIdx] / H) * 100}%`,
            left: `${tooltipLeftPct}%`,
            transform: flip
              ? "translate(calc(-100% - 10px), -110%)"
              : "translate(10px, -110%)",
            backgroundColor: "var(--color-surface-2)",
            border: "1px solid var(--color-border-strong)",
            borderRadius: "8px",
            whiteSpace: "nowrap",
          }}
        >
          <p className="stat text-[10px]" style={{ color: "var(--color-muted)" }}>
            {fmtDate(hover.date)}
          </p>
          <p className="stat text-sm font-bold" style={{ color: "var(--color-trend-up)" }}>
            {hover.score.toFixed(1)}
            {prev && hover.score !== prev.score && (
              <span
                className="text-[10px] ml-1.5"
                style={{
                  color:
                    hover.score > prev.score
                      ? "var(--color-trend-up)"
                      : "var(--color-accent)",
                }}
              >
                {hover.score > prev.score ? "+" : ""}
                {(hover.score - prev.score).toFixed(1)}
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

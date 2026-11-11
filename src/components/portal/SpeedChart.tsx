"use client";

import { useRef, useState } from "react";

/**
 * One van's speed over a day: a single 2px line (no legend — the title names
 * it), a labeled dashed line at the speed limit, recessive grid, and a
 * crosshair that snaps to the nearest reading with a time + mph tooltip.
 * Gaps (van off / no adapter) break the line instead of drawing a fake slope.
 */

type Point = { t: number; mph: number };

const W = 900;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 28, left: 40 };
const GAP_MS = 2 * 60_000;

export function SpeedChart({
  points,
  limitMph,
  timeZone,
}: {
  points: Point[];
  limitMph: number;
  timeZone: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) return null;

  const t0 = points[0].t;
  const t1 = Math.max(points[points.length - 1].t, t0 + 60 * 60_000);
  const yMax = Math.max(80, Math.ceil((Math.max(...points.map((p) => p.mph), limitMph) + 5) / 10) * 10);
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (mph: number) => PAD.top + (1 - mph / yMax) * (H - PAD.top - PAD.bottom);

  // Split into runs wherever readings are far apart.
  const runs: Point[][] = [];
  points.forEach((p, i) => {
    if (i === 0 || p.t - points[i - 1].t > GAP_MS) runs.push([]);
    runs[runs.length - 1].push(p);
  });

  const fmt = (t: number) =>
    new Date(t).toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });

  const ticks: number[] = [];
  const hour = 60 * 60_000;
  const step = t1 - t0 > 8 * hour ? 2 * hour : hour;
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) ticks.push(t);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const t = t0 + ((px - PAD.left) / (W - PAD.left - PAD.right)) * (t1 - t0);
    let lo = 0;
    let hi = points.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (points[mid].t < t) lo = mid;
      else hi = mid;
    }
    setHover(Math.abs(points[lo].t - t) < Math.abs(points[hi].t - t) ? lo : hi);
  }

  const hp = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        role="img"
        aria-label={`Speed over the day, top speed ${Math.max(...points.map((p) => p.mph))} mph`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {/* grid + y axis */}
        {Array.from({ length: yMax / 20 + 1 }, (_, i) => i * 20).map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#e8ecf3" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#5b6b85">
              {v}
            </text>
          </g>
        ))}
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={H - 8} textAnchor="middle" fontSize={11} fill="#5b6b85">
            {fmt(t)}
          </text>
        ))}

        {/* speed limit reference */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(limitMph)}
          y2={y(limitMph)}
          stroke="#b3261e"
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
        <text x={W - PAD.right} y={y(limitMph) - 6} textAnchor="end" fontSize={11} fill="#1a2b4a">
          Limit {limitMph} mph
        </text>

        {/* the series */}
        {runs.map((run, i) =>
          run.length === 1 ? (
            <circle key={i} cx={x(run[0].t)} cy={y(run[0].mph)} r={2} fill="#1a2b4a" />
          ) : (
            <polyline
              key={i}
              points={run.map((p) => `${x(p.t).toFixed(1)},${y(p.mph).toFixed(1)}`).join(" ")}
              fill="none"
              stroke="#1a2b4a"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ),
        )}

        {/* crosshair */}
        {hp && (
          <g pointerEvents="none">
            <line x1={x(hp.t)} x2={x(hp.t)} y1={PAD.top} y2={H - PAD.bottom} stroke="#5b6b85" strokeWidth={1} />
            <circle cx={x(hp.t)} cy={y(hp.mph)} r={5} fill="#1a2b4a" stroke="#ffffff" strokeWidth={2} />
          </g>
        )}
      </svg>

      {hp && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg bg-white px-3 py-2 text-sm shadow-md ring-1 ring-navy-100"
          style={{
            left: `${(x(hp.t) / W) * 100}%`,
            transform: x(hp.t) > W * 0.7 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
          }}
        >
          <div className="text-xs text-navy-500">
            {new Date(hp.t).toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit", second: "2-digit" })}
          </div>
          <div className="font-semibold text-navy-900">{hp.mph} mph</div>
        </div>
      )}
    </div>
  );
}

import { useId } from "react";

const POINTS = 60;

/**
 * The last minute as a line with a soft fill. `max` fixes the scale
 * (percentages); without it the line uses the window's own peak (network).
 */
export function Sparkline({ values, color, max }: { values: number[]; color: string; max?: number }) {
  const id = useId();
  const w = 120;
  const h = 30;
  const top = max ?? Math.max(1, ...values) * 1.15;
  // Newest on the right; a short history starts mid-way.
  const offset = POINTS - values.length;
  const points = values.map((v, i) => {
    const x = ((offset + i) / (POINTS - 1)) * w;
    const y = h - (Math.min(Math.max(v, 0), top) / top) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  if (points.length < 2) return <svg className="mon-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" />;
  const first = points[0].split(",")[0];

  return (
    <svg className="mon-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${first},${h} ${points.join(" ")} ${w},${h}`} fill={`url(#${id})`} />
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

import { useEffect, useRef } from "react";
import { useTauriEvent } from "../../core/bridge";

const WEIGHTS = [0.55, 0.85, 1, 0.75, 0.5];

/**
 * Audio bars driven by the output device's peak level (`media://level`).
 * Bars are mutated directly in a rAF loop so levels never re-render React.
 */
export function Visualizer({
  playing,
  color,
  height = 16,
  barWidth = 3,
}: {
  playing: boolean;
  color: string;
  height?: number;
  barWidth?: number;
}) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const target = useRef(0);
  const current = useRef(WEIGHTS.map(() => 0.15));

  useTauriEvent<number>("media://level", (level) => {
    // Perceptual curve: quiet passages still move the bars a bit.
    target.current = Math.min(1, Math.pow(level, 0.6) * 1.15);
  });

  useEffect(() => {
    let raf = 0;
    let t = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      t += 1;
      const base = playing ? target.current : 0;
      current.current = current.current.map((v, i) => {
        // Per-bar wobble so the bars don't move in lockstep.
        const wobble = playing ? 0.75 + 0.25 * Math.sin(t / (5 + i * 1.7) + i * 2.1) : 1;
        const goal = Math.max(0.14, base * WEIGHTS[i] * wobble);
        const k = goal > v ? 0.45 : 0.12; // fast attack, slow release
        const next = v + (goal - v) * k;
        const el = bars.current[i];
        if (el) el.style.transform = `scaleY(${next.toFixed(3)})`;
        return next;
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  return (
    <div className="visualizer" style={{ height, gap: barWidth * 0.8 }}>
      {WEIGHTS.map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el;
          }}
          style={{ width: barWidth, background: color, boxShadow: `0 0 8px ${color}55` }}
        />
      ))}
    </div>
  );
}

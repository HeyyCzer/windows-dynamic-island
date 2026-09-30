import { useEffect, useRef } from "react";
import { useTauriEvent } from "../../../core/bridge";
import { LEVEL_EVENT } from "../hooks/useMusic";

const WEIGHTS = [0.6, 0.9, 1, 0.8, 0.55];
const FLOOR = 0;

/**
 * Audio bars driven by the player's peak level (`music://level`).
 *
 * Raw peaks depend on volume and are smoothed by Windows, so the level goes
 * through an automatic gain (normalised by the recent max) and the deviation
 * from its moving average is boosted to make beats visible. Bars are mutated
 * directly in a rAF loop so levels never re-render React.
 */
export function Visualizer({
	playing,
	color,
	height = 22,
	barWidth = 3,
}: {
	playing: boolean;
	color: string;
	height?: number;
	barWidth?: number;
}) {
	const bars = useRef<(HTMLSpanElement | null)[]>([]);
	const raw = useRef(0);

	useTauriEvent<number>(LEVEL_EVENT, (level) => {
		raw.current = level;
	});

	useEffect(() => {
		let raf = 0;
		let t = 0;
		let peak = 0.05; // auto-gain reference
		let avg = 0; // slow moving average
		const current = WEIGHTS.map(() => FLOOR);

		const loop = () => {
			raf = requestAnimationFrame(loop);
			t += 1;

			const level = playing ? raw.current : 0;
			peak = Math.max(level, peak * 0.995, 0.02);
			avg += (level - avg) * 0.05;
			const norm = level / peak;
			const punch = Math.max(0, (level - avg) / peak) * 2.2;
			const energy = level < 0.004 ? 0 : Math.min(1, norm * 0.55 + punch);

			current.forEach((v, i) => {
				// Per-bar wobble so the bars don't move in lockstep.
				const wobble = 0.7 + 0.3 * Math.sin(t / (4 + i * 1.3) + i * 2.1);
				const goal = Math.max(FLOOR, energy * WEIGHTS[i] * wobble);
				const k = goal > v ? 0.5 : 0.14; // fast attack, slow release
				current[i] = v + (goal - v) * k;
				// Animate height (not scaleY) so the rounded caps never get squashed;
				// the smallest bar is a perfect dot.
				const el = bars.current[i];
				if (el) el.style.height = `${(barWidth + (height - barWidth) * current[i]).toFixed(1)}px`;
			});
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [playing, height, barWidth]);

	return (
		<div className="visualizer" style={{ height, gap: barWidth * 0.75 }}>
			{WEIGHTS.map((_, i) => (
				<span
					key={i}
					ref={(el) => {
						bars.current[i] = el;
					}}
					style={{
						width: barWidth,
						height: barWidth,
						borderRadius: barWidth,
						background: color,
						boxShadow: `0 0 10px ${color}55`,
					}}
				/>
			))}
		</div>
	);
}

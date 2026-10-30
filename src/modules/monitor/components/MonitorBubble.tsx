import { levelColor, type MonitorState } from "../types";

const R = 15;
const C = 2 * Math.PI * R;

/** Side bubble: a CPU ring with its percentage, and a memory dot. */
export function MonitorBubble({ state }: { state: MonitorState }) {
	const cpu = state.cpu ?? 0;
	const memory = state.memoryUsed != null && state.memoryTotal ? (state.memoryUsed / state.memoryTotal) * 100 : null;
	return (
		<span className="relative grid size-8.5 place-items-center">
			<svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36" aria-hidden>
				<circle cx="18" cy="18" r={R} className="fill-none stroke-3 stroke-white/12" />
				<circle
					cx="18"
					cy="18"
					r={R}
					className="fill-none stroke-3 [stroke-linecap:round] transition-[stroke-dasharray] duration-600 ease-[ease]"
					stroke={levelColor(cpu)}
					strokeDasharray={`${(Math.min(cpu, 100) / 100) * C} ${C}`}
				/>
			</svg>
			<span className="text-[11px] font-bold tabular-nums">{Math.round(cpu)}</span>
			{memory != null && (
				<i
					className="absolute right-px bottom-px size-1.75 rounded-full shadow-[0_0_0_2px_var(--island)]"
					style={{ background: levelColor(memory) }}
				/>
			)}
		</span>
	);
}

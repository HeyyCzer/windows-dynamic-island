import { levelColor, type MonitorState } from "../types";

const R = 15;
const C = 2 * Math.PI * R;

/** Side bubble: a CPU ring with its percentage, and a memory dot. */
export function MonitorBubble({ state }: { state: MonitorState }) {
  const cpu = state.cpu ?? 0;
  const memory = state.memoryUsed != null && state.memoryTotal ? (state.memoryUsed / state.memoryTotal) * 100 : null;
  return (
    <span className="mon-bubble">
      <svg viewBox="0 0 36 36" aria-hidden>
        <circle cx="18" cy="18" r={R} className="mon-ring-track" />
        <circle
          cx="18"
          cy="18"
          r={R}
          className="mon-ring"
          stroke={levelColor(cpu)}
          strokeDasharray={`${(Math.min(cpu, 100) / 100) * C} ${C}`}
        />
      </svg>
      <span className="mon-bubble-value">{Math.round(cpu)}</span>
      {memory != null && <i className="mon-bubble-dot" style={{ background: levelColor(memory) }} />}
    </span>
  );
}

/** Mirrors `MonitorState` in `src-tauri/src/providers/monitor/mod.rs`. */
export interface MonitorState {
  /** Percent. */
  cpu: number | null;
  gpu: number | null;
  /** Bytes. */
  memoryUsed: number | null;
  memoryTotal: number | null;
  /** Bytes per second. */
  down: number | null;
  up: number | null;
  /** Oldest first, one value per second (percentages, bytes/s for the network). */
  history: { cpu: number[]; memory: number[]; gpu: number[]; down: number[]; up: number[] };
  /** Logical processors. */
  cores: number;
}

export const MONITOR_PROVIDER = "monitor";
export const MONITOR_GREEN = "#30D158";
export const NETWORK_BLUE = "#0A84FF";

/** Green, then orange, then red as a percentage climbs. */
export function levelColor(percent: number): string {
  if (percent >= 85) return "#FF453A";
  if (percent >= 60) return "#FF9F0A";
  return MONITOR_GREEN;
}

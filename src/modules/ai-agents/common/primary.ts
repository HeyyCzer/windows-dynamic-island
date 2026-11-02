import type { AgentDefinition, AgentSnapshot } from "./types";

/**
 * The agent the island stands for when none is busy: the one used last, so a
 * Codex-only user sees Codex, not Claude. Falls back to the first agent.
 */
export function pickPrimary(agents: AgentDefinition[], snapshots: AgentSnapshot[]): AgentDefinition {
	let best = 0;
	let bestAt = -1;
	snapshots.forEach((snapshot, i) => {
		for (const s of snapshot.sessions) {
			if (s.lastEventAt > bestAt) {
				best = i;
				bestAt = s.lastEventAt;
			}
		}
	});
	return agents[best];
}

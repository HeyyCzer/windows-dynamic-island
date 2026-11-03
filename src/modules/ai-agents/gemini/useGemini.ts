import { useProvider } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import type { AgentSnapshot, UsageLimit } from "../common/types";

export interface GeminiState {
	available?: boolean;
	connected?: boolean;
	error?: string;
	limits?: (UsageLimit & { window?: string })[];
}
export const PROVIDER = "gemini";

/** The backend only publishes verified quota data, never invented sessions/tokens. */
export function useGemini(): AgentSnapshot {
	const t = useT();
	const state = useProvider<GeminiState>(PROVIDER);
	const windowName = (window?: string) =>
		window === "5h"
			? t("agents.antigravity.fiveHour")
			: window === "weekly"
				? t("agents.antigravity.weekly")
				: t("agents.antigravity.quota");
	return {
		available: state?.available === true,
		connection: state?.connected ? "connected" : "disconnected",
		model: t(state?.connected ? "agents.status.connected" : "agents.status.disconnected"),
		limits: state?.connected
			? (state.limits ?? []).map((limit) => ({ ...limit, label: `${limit.label} · ${windowName(limit.window)}` }))
			: [],
		limitsHint: state?.connected
			? t("agents.noLimits")
			: t(state?.error === "not-running" ? "agents.antigravity.notRunning" : "agents.antigravity.serviceUnavailable"),
		metricsHint: t("agents.antigravity.metricsUnavailable"),
		sessions: [],
	};
}

import { providerAction, useProvider } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import type { AgentSnapshot, UsageLimit } from "../common/types";

/** Mirrors the state published by `src-tauri/src/providers/antigravity.rs`. */
export interface AntigravityState {
	available: boolean;
	/** The exe in use (the setting, else `defaultExe`). */
	exe: string;
	defaultExe: string;
	connected: boolean;
	error: "not-running" | "service-unavailable" | null;
	limits: (UsageLimit & { window: string })[];
}

export const PROVIDER = "antigravity";

const launch = () => providerAction(PROVIDER, "launch");

/** Only the plan quota: Antigravity exposes no sessions or token counts. */
export function useAntigravity(): AgentSnapshot {
	const state = useProvider<AntigravityState>(PROVIDER);
	const t = useT();

	if (!state?.available) return { available: false, sessions: [], limits: [] };

	const window = (w: string) =>
		w === "5h"
			? t("antigravity.window.fiveHour")
			: w === "weekly"
				? t("antigravity.window.weekly")
				: t("antigravity.window.quota");

	return {
		available: true,
		sessions: [],
		limits: state.limits.map((l) => ({ ...l, label: `${l.label} · ${window(l.window)}` })),
		limitsHint: state.error === "service-unavailable" ? t("antigravity.serviceUnavailable") : undefined,
		metricsHint: t("antigravity.metricsUnavailable"),
		setup:
			state.error === "not-running"
				? { message: t("antigravity.notRunning"), actionLabel: t("antigravity.launch"), action: launch }
				: undefined,
	};
}

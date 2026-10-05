import { providerAction, useProvider } from "../../../core/bridge";
import { useT, type MessageKey, type Translate } from "../../../core/i18n";
import type { AgentSession, AgentSnapshot, AgentStatus, UsageLimit } from "../common/types";

/** Mirrors `ClaudeState` in `src-tauri/src/providers/claude/mod.rs`. */
interface ClaudeState {
	sessions: {
		id: string;
		project: string;
		cwd: string;
		status: Exclude<AgentStatus, "limitsReset">;
		activity: Activity | null;
		tool: string | null;
		turnStartedAt: number | null;
		finishedAt: number | null;
		lastEventAt: number;
		model: string | null;
		contextPct: number | null;
		source: "hooks" | "transcript";
	}[];
	limits: {
		fiveHour: { usedPct: number; resetsAt: number | null } | null;
		sevenDay: { usedPct: number; resetsAt: number | null } | null;
		updatedAt: number;
	} | null;
	/** Unix ms — a used limit window just rolled over; the backend clears it after a few seconds. */
	limitsResetAt: number | null;
	model: string | null;
	tokensToday: { input: number; output: number; cacheRead: number; cacheWrite: number; messages: number };
	integration: { hooks: boolean; statusline: boolean; serverOk: boolean };
}

/** Mirrors `Activity` in `src-tauri/src/providers/claude/activity.rs`. */
interface Activity {
	kind: string;
	arg?: string;
	permission?: boolean;
}

const PROVIDER = "claude";

const refreshLimits = () => void providerAction(PROVIDER, "refreshLimits").catch(() => { });

export function useClaude(): AgentSnapshot {
	const state = useProvider<ClaudeState>(PROVIDER);
	const t = useT();

	if (!state) return { available: false, sessions: [], limits: [] };

	const { fiveHour, sevenDay } = state.limits ?? {};

	const limits: UsageLimit[] = [];
	if (fiveHour) limits.push({ id: "5h", label: t("agents.limit.fiveHour"), usedPct: fiveHour.usedPct, resetsAt: toMs(fiveHour.resetsAt) });
	if (sevenDay) limits.push({ id: "7d", label: t("agents.limit.sevenDay"), usedPct: sevenDay.usedPct, resetsAt: toMs(sevenDay.resetsAt) });

	const { hooks, statusline, serverOk } = state.integration;
	const installed = hooks && statusline;
	return {
		available: true,
		model: state.model,
		tokensToday: state.tokensToday,
		limits,
		limitsHint: t("claude.limitsHint.loading"),
		refreshLimits,
		sessions: [
			...(state.limitsResetAt ? [limitsResetSession(t, state.limitsResetAt)] : []),
			...state.sessions.map((s) => ({
				id: s.id,
				title: s.project,
				status: s.status,
				activity: s.activity && describe(t, s.activity),
				turnStartedAt: s.turnStartedAt,
				finishedAt: s.finishedAt,
				lastEventAt: s.lastEventAt,
				model: s.model,
				contextPct: s.contextPct,
			})),
		],
		setup: installed
			? undefined
			: {
				message: serverOk ? t("claude.setup.message") : t("claude.setup.serverDown"),
				actionLabel: t("claude.setup.action"),
				action: () => providerAction(PROVIDER, "install"),
			},
	};
}

/** Pseudo-session so the island peeks when the plan limits reset. */
function limitsResetSession(t: Translate, at: number): AgentSession {
	return { id: `limits-reset-${at}`, title: t("agents.status.limitsReset"), status: "limitsReset", lastEventAt: at };
}

function describe(t: Translate, a: Activity) {
	const key = `activity.${a.kind}` as MessageKey;
	const text = t(key, { arg: a.arg ?? "" });
	const label = text === key ? (a.arg ?? a.kind) : text; // unknown kind from a newer backend
	return a.permission ? t("activity.permission", { what: label }) : label;
}

const toMs = (unixSeconds: number | null) => (unixSeconds ? unixSeconds * 1000 : null);

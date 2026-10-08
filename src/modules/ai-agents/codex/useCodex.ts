import { useProvider } from "../../../core/bridge";
import { useT, type MessageKey, type Translate } from "../../../core/i18n";
import type { AgentSnapshot, AgentStatus, UsageLimit } from "../common/types";

interface LimitWindow {
	usedPct: number;
	windowMinutes: number | null;
	resetsAt: number | null;
}

/** Mirrors `CodexState` in `src-tauri/src/providers/codex/mod.rs`. */
export interface CodexState {
	available: boolean;
	sessions: {
		id: string;
		project: string;
		cwd: string;
		status: Exclude<AgentStatus, "limitsReset">;
		activity: { kind: string; arg?: string } | null;
		turnStartedAt: number | null;
		finishedAt: number | null;
		lastEventAt: number;
		model: string | null;
		contextPct: number | null;
		summary: string | null;
		prompt: string | null;
	}[];
	limits: { primary: LimitWindow | null; secondary: LimitWindow | null; updatedAt: number } | null;
	model: string | null;
	tokensToday: { input: number; output: number; cacheRead: number; cacheWrite: number; messages: number };
	usage: { daily: { date: string; tokens: number; responses: number }[]; last5hTokens: number };
}

export const PROVIDER = "codex";

export function useCodex(): AgentSnapshot {
	const state = useProvider<CodexState>(PROVIDER);
	const t = useT();

	if (!state?.available) return { available: false, sessions: [], limits: [] };

	const limits: UsageLimit[] = [];
	const { primary, secondary } = state.limits ?? {};
	if (primary) limits.push(limit(t, "primary", primary, "agents.limit.fiveHour"));
	if (secondary) limits.push(limit(t, "secondary", secondary, "agents.limit.sevenDay"));

	return {
		available: true,
		model: state.model,
		tokensToday: state.tokensToday,
		usage: state.usage,
		limits,
		limitsHint: t("codex.limitsHint"),
		sessions: state.sessions.map((s) => ({
			id: s.id,
			title: s.project,
			status: s.status,
			activity: s.activity && describe(t, s.activity),
			turnStartedAt: s.turnStartedAt,
			finishedAt: s.finishedAt,
			lastEventAt: s.lastEventAt,
			model: s.model,
			contextPct: s.contextPct,
			summary: s.summary,
			prompt: s.prompt,
			cwd: s.cwd,
		})),
	};
}

/** Labelled by its length: Codex's are 5h and a week today, but it says so itself. */
function limit(t: Translate, id: string, w: LimitWindow, fallback: MessageKey): UsageLimit {
	const m = w.windowMinutes;
	const label =
		m === 300 || (m == null && fallback === "agents.limit.fiveHour")
			? t("agents.limit.fiveHour")
			: m === 10_080 || m == null
				? t(fallback)
				: t("codex.limitWindow", { time: m % 1440 === 0 ? `${m / 1440}d` : m % 60 === 0 ? `${m / 60}h` : `${m} min` });
	return { id, label, usedPct: w.usedPct, resetsAt: w.resetsAt ? w.resetsAt * 1000 : null };
}

function describe(t: Translate, a: { kind: string; arg?: string }) {
	const key = `activity.${a.kind}` as MessageKey;
	const text = t(key, { arg: a.arg ?? "" });
	return text === key ? (a.arg ?? a.kind) : text; // unknown kind from a newer backend
}

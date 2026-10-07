import type { ComponentType, ReactNode } from "react";

/**
 * Contract every AI agent integration implements (Claude today; Codex,
 * Gemini, … tomorrow). The AI Agents module only talks to this interface.
 */
export interface AgentDefinition {
	id: string;
	name: string;
	/** Brand-ish accent used for icons, bars and highlights. */
	color: string;
	Icon: (props: { size: number; state?: AgentStatus }) => ReactNode;
	/** React hook returning the agent's live snapshot. */
	useAgent: () => AgentSnapshot;
	/** Web page with the plan's usage; clicking the limits opens it. */
	usageUrl?: string;
	/** Opens a session (e.g. its project in the editor). */
	openSession?: (session: AgentSession) => void;
	/** Answers a session's pending permission request from the island. */
	decide?: (session: AgentSession, decision: PermissionDecision) => Promise<unknown>;
	/** Agent-specific block in the settings window (integration setup…). */
	SettingsSection?: ComponentType;
}

export type AgentStatus = "idle" | "working" | "waiting" | "done" | "limitsReset";

export interface AgentSession {
	id: string;
	/** Usually the project folder name. */
	title: string;
	status: AgentStatus;
	/** What it's doing right now, already translated ("Editing App.tsx"). */
	activity?: string | null;
	/** Unix ms — start of the current/last turn, drives the live timer. */
	turnStartedAt?: number | null;
	finishedAt?: number | null;
	lastEventAt: number;
	model?: string | null;
	contextPct?: number | null;
	/** Start of the last reply, once the turn ended. */
	summary?: string | null;
	/** The last prompt typed in it (tells apart sessions of one project). */
	prompt?: string | null;
	/** Project folder (clicking the session opens it). */
	cwd?: string | null;
	/** A permission request the island can answer. */
	permission?: PendingPermission | null;
}

export interface PendingPermission {
	id: string;
	/** Tool name (`Bash`, `Edit`, `mcp__…`). */
	tool: string;
	/** The command, file, URL… it's about. */
	detail: string | null;
	/** The rules "Always allow" saves (as Claude Code suggests them). */
	always: string | null;
	/** Unix ms. */
	since: number;
}

export type PermissionDecision = "allow" | "always" | "deny";

export interface UsageLimit {
	id: string;
	label: string;
	usedPct: number;
	/** Unix ms. */
	resetsAt?: number | null;
}

export interface TokenUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	messages: number;
}

export interface AgentSnapshot {
	available: boolean;
	sessions: AgentSession[];
	limits: UsageLimit[];
	/** Shown when `limits` is empty. */
	limitsHint?: string;
	/** Called (throttled by the backend) while the agent's card is on screen. Must be stable. */
	refreshLimits?: () => void;
	tokensToday?: TokenUsage;
	/** Tokens and responses per day (last 7, today last) and in the last 5 hours. */
	usage?: UsageHistory;
	model?: string | null;
	/** Call-to-action when the integration needs to be set up. */
	setup?: {
		message: string;
		actionLabel: string;
		action: () => Promise<unknown>;
	};
}

export interface UsageHistory {
	daily: { date: string; tokens: number; responses: number }[];
	last5hTokens: number;
}

/** A session together with the agent it belongs to. */
export interface AgentSessionRef {
	agent: AgentDefinition;
	session: AgentSession;
}

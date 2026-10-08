/**
 * AI Agents module — shows what coding agents are doing.
 *
 * Layout:
 *   common/   agent-agnostic types, formatting and UI (cards, session list…)
 *   claude/   Claude Code integration (one `AgentDefinition`)
 *
 * To support another agent, add a folder exporting an `AgentDefinition` and
 * append it to `agents` below.
 */
import { SparkleIcon } from "../../components/icons";
import type { IslandModule, ModuleView } from "../../core/types";
import { claudeAgent } from "./claude";
import { AgentCompactLeft, AgentCompactRight } from "./common/components/AgentCompact";
import { AgentsPanel } from "./common/components/AgentsPanel";
import { StatusGlyph } from "./common/components/StatusGlyph";
import { useNow } from "./common/format";
import type { AgentDefinition, AgentSessionRef, AgentStatus } from "./common/types";
import { agentSettings } from "./settings";
import { useSetting } from "../../core/settings";
import "./ai-agents.css";

const agents: AgentDefinition[] = [claudeAgent];

/** How long a finished turn keeps the island's attention. */
const DONE_VISIBLE_MS = 8_000;
const RECENT_MS = 30 * 60_000;
/** Height of the 7-day usage row. */
const USAGE_CHART = 74;
/** The permission request card plus the "Now" heading. */
const PERMISSION_PROMPT = 196;

const RANK: Record<AgentStatus, number> = { waiting: 0, limitsReset: 1, working: 2, done: 3, idle: 4 };
const PRIORITY: Record<AgentStatus, number> = { waiting: 90, limitsReset: 80, done: 70, working: 60, idle: 0 };

export const aiAgentsModule: IslandModule = {
	id: "ai-agents",
	title: "agents.title",
	settingsIcon: <SparkleIcon size={15} />,
	settings: Object.values(agentSettings),
	SettingsSection: () => (
		<>
			{agents.map((a) => a.SettingsSection && <a.SettingsSection key={a.id} />)}
		</>
	),
	useView(): ModuleView {
		const peekOnWaiting = useSetting(agentSettings.peekOnWaiting);
		const peekOnDone = useSetting(agentSettings.peekOnDone);
		const peekOnLimitsReset = useSetting(agentSettings.peekOnLimitsReset);
		const peekOn: Partial<Record<AgentStatus, boolean>> = {
			waiting: peekOnWaiting,
			done: peekOnDone,
			limitsReset: peekOnLimitsReset,
		};

		// Static list → stable hook order.
		const snapshots = agents.map((a) => a.useAgent());

		const sessions: AgentSessionRef[] = agents
			.flatMap((agent, i) => snapshots[i].sessions.map((session) => ({ agent, session })))
			.sort(
				(a, b) =>
					RANK[a.session.status] - RANK[b.session.status] || b.session.lastEventAt - a.session.lastEventAt,
			);

		const hasDone = sessions.some((s) => s.session.status === "done");
		const now = useNow(1000, hasDone);

		const isHot = ({ session: s }: AgentSessionRef) =>
			s.status === "working" ||
			s.status === "waiting" ||
			// Only present while fresh — the agent drops it.
			s.status === "limitsReset" ||
			(s.status === "done" && now - (s.finishedAt ?? 0) < DONE_VISIBLE_MS);

		const hot = sessions.find(isHot);
		const busyCount = sessions.filter((s) => s.session.status === "working" || s.session.status === "waiting").length;
		const recent = sessions
			.filter((s) => s.session.status !== "idle" || now - s.session.lastEventAt < RECENT_MS)
			.slice(0, 4);

		const primary = agents[0];
		const asking = sessions.some((s) => s.session.permission && s.agent.decide);

		return {
			active: !!hot,
			priority: hot ? PRIORITY[hot.session.status] : 0,
			// A permission to answer: opening the island goes straight to it.
			attention: asking,
			icon: <StatusGlyph agent={hot?.agent ?? primary} status={hot?.session.status ?? "idle"} size={18} />,
			compact: hot && {
				left: <AgentCompactLeft hot={hot} busyCount={busyCount} />,
				right: <AgentCompactRight hot={hot} />,
				width: 340,
			},
			expanded: <AgentsPanel agents={agents} snapshots={snapshots} sessions={recent} />,
			expandedSize: asking
				? { width: 620, height: PERMISSION_PROMPT + Math.max(1, recent.length) * 30 }
				: {
					width: 620,
					height: 236 + Math.max(1, recent.length) * 30 + (snapshots.some((s) => s.usage?.daily.length) ? USAGE_CHART : 0),
				},
			// Peek when an agent needs you, just finished or its limits reset (each is a setting).
			activityKey:
				hot && peekOn[hot.session.status]
					? `${hot.agent.id}:${hot.session.id}:${hot.session.status}:${hot.session.finishedAt ?? hot.session.lastEventAt}`
					: undefined,
		};
	},
};

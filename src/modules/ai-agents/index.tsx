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
import type { IslandModule, ModuleView } from "../../core/types";
import { claudeAgent } from "./claude";
import { AgentCompactLeft, AgentCompactRight } from "./common/components/AgentCompact";
import { AgentsPanel } from "./common/components/AgentsPanel";
import { StatusGlyph } from "./common/components/StatusGlyph";
import { useNow } from "./common/format";
import type { AgentDefinition, AgentSessionRef, AgentStatus } from "./common/types";
import "./ai-agents.css";

const agents: AgentDefinition[] = [claudeAgent];

/** How long a finished turn keeps the island's attention. */
const DONE_VISIBLE_MS = 8_000;
const RECENT_MS = 30 * 60_000;

const RANK: Record<AgentStatus, number> = { waiting: 0, working: 1, done: 2, idle: 3 };
const PRIORITY: Record<AgentStatus, number> = { waiting: 90, done: 70, working: 60, idle: 0 };

export const aiAgentsModule: IslandModule = {
  id: "ai-agents",
  title: "AI Agents",
  useView(): ModuleView {
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
      (s.status === "done" && now - (s.finishedAt ?? 0) < DONE_VISIBLE_MS);
    const hot = sessions.find(isHot);
    const busyCount = sessions.filter((s) => s.session.status === "working" || s.session.status === "waiting").length;
    const recent = sessions
      .filter((s) => s.session.status !== "idle" || now - s.session.lastEventAt < RECENT_MS)
      .slice(0, 4);

    const primary = agents[0];
    return {
      active: !!hot,
      priority: hot ? PRIORITY[hot.session.status] : 0,
      icon: <StatusGlyph agent={hot?.agent ?? primary} status={hot?.session.status ?? "idle"} size={18} />,
      compact: hot && {
        left: <AgentCompactLeft hot={hot} busyCount={busyCount} />,
        right: <AgentCompactRight hot={hot} />,
        width: 340,
      },
      expanded: <AgentsPanel agents={agents} snapshots={snapshots} sessions={recent} />,
      expandedSize: { width: 620, height: 196 + Math.max(1, recent.length) * 30 },
      // Peek when an agent needs you or just finished.
      activityKey:
        hot && (hot.session.status === "waiting" || hot.session.status === "done")
          ? `${hot.agent.id}:${hot.session.id}:${hot.session.status}:${hot.session.finishedAt ?? hot.session.lastEventAt}`
          : undefined,
    };
  },
};

import { useT } from "../../../../core/i18n";
import { useNow } from "../format";
import type { AgentDefinition, AgentSessionRef, AgentSnapshot } from "../types";
import { AgentCard } from "./AgentCard";
import { SessionList } from "./SessionList";
import { UsageChart } from "./UsageChart";

/** Expanded "AI Agents" dashboard. */
export function AgentsPanel({
  agents,
  snapshots,
  sessions,
}: {
  agents: AgentDefinition[];
  snapshots: AgentSnapshot[];
  sessions: AgentSessionRef[];
}) {
  const busy = sessions.some((s) => s.session.status === "working" || s.session.status === "waiting");
  const now = useNow(busy ? 1000 : 30_000);
  const t = useT();

  return (
    <div className="agents-panel">
      {agents.map((agent, i) => (
        <AgentCard key={agent.id} agent={agent} snapshot={snapshots[i]} now={now} />
      ))}
      {agents.map((agent, i) => {
        const usage = snapshots[i].usage;
        return usage?.daily.length ? <UsageChart key={agent.id} usage={usage} color={agent.color} /> : null;
      })}
      <div className="agents-now">
        <span className="agents-section-label">{t("agents.now")}</span>
        <SessionList items={sessions} now={now} showAgent={agents.length > 1} />
      </div>
    </div>
  );
}

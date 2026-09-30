import { useNow } from "../format";
import type { AgentDefinition, AgentSessionRef, AgentSnapshot } from "../types";
import { AgentCard } from "./AgentCard";
import { SessionList } from "./SessionList";

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

  return (
    <div className="agents-panel">
      {agents.map((agent, i) => (
        <AgentCard key={agent.id} agent={agent} snapshot={snapshots[i]} now={now} />
      ))}
      <div className="agents-now">
        <span className="agents-section-label">Agora</span>
        <SessionList items={sessions} now={now} />
      </div>
    </div>
  );
}

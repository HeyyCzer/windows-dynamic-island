import { useState } from "react";
import { useT } from "../../../../core/i18n";
import { useNow } from "../format";
import type { AgentDefinition, AgentSessionRef, AgentSnapshot } from "../types";
import { AgentCard } from "./AgentCard";
import { PermissionPrompt } from "./PermissionPrompt";
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
  const asking = sessions.filter((s) => s.session.permission && s.agent.decide);
  // Picked tab, else the agent of the busiest session.
  const [picked, setPicked] = useState<string | null>(null);
  const index = Math.max(0, agents.findIndex((a) => a.id === (picked ?? sessions[0]?.agent.id)));
  const agent = agents[index];
  const usage = snapshots[index]?.usage;

  // Something to answer: just that, and the sessions.
  if (asking.length) {
    return (
      <div className="agents-panel">
        <PermissionPrompt key={asking[0].session.permission!.id} item={asking[0]} now={now} more={asking.length - 1} />
        <div className="agents-now">
          <span className="agents-section-label">{t("agents.now")}</span>
          <SessionList items={sessions} now={now} showAgent={agents.length > 1} />
        </div>
      </div>
    );
  }

  return (
    <div className="agents-panel">
      {agents.length > 1 && (
        <div className="agents-tabs" role="tablist">
          {agents.map((a) => (
            <button
              key={a.id}
              role="tab"
              aria-selected={a === agent}
              className={`agents-tab ${a === agent ? "is-active" : ""}`}
              style={{ "--agent": a.color } as React.CSSProperties}
              onClick={(e) => {
                e.stopPropagation();
                setPicked(a.id);
              }}
            >
              <a.Icon size={14} />
              {a.name}
            </button>
          ))}
        </div>
      )}
      <AgentCard key={agent.id} agent={agent} snapshot={snapshots[index]} now={now} />
      {usage?.daily.length ? <UsageChart usage={usage} color={agent.color} /> : null}
      <div className="agents-now">
        <span className="agents-section-label">{t("agents.now")}</span>
        <SessionList items={sessions} now={now} showAgent={agents.length > 1} />
      </div>
    </div>
  );
}

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useT } from "../../../../core/i18n";
import { formatTokens } from "../format";
import type { AgentDefinition, AgentSnapshot } from "../types";
import { LimitBar } from "./LimitBar";

const LIMITS_REFRESH_MS = 2 * 60_000;

/** One agent's summary: plan limits on the left, today's tokens on the right. */
export function AgentCard({ agent, snapshot, now }: { agent: AgentDefinition; snapshot: AgentSnapshot; now: number }) {
  const tr = useT();
  const t = snapshot.tokensToday;
  const total = t ? t.input + t.output + t.cacheRead + t.cacheWrite : 0;

  // The card is only mounted while the panel is visible.
  const { refreshLimits } = snapshot;
  useEffect(() => {
    if (!refreshLimits) return;
    refreshLimits();
    const id = setInterval(refreshLimits, LIMITS_REFRESH_MS);
    return () => clearInterval(id);
  }, [refreshLimits]);

  return (
    <div className="agents-card" style={{ "--agent": agent.color } as React.CSSProperties}>
      <div className="agents-card-col">
        <div className="agents-card-head">
          <agent.Icon size={18} />
          <span className="agents-card-name">{agent.name}</span>
          {snapshot.model && <span className="agents-badge">{snapshot.model}</span>}
        </div>
        {snapshot.limits.length ? (
          <div className="agents-limits">
            {snapshot.limits.map((l) => (
              <LimitBar key={l.id} limit={l} color={agent.color} now={now} />
            ))}
          </div>
        ) : (
          <p className="agents-hint">{snapshot.limitsHint ?? tr("agents.noLimits")}</p>
        )}
        {snapshot.setup && <SetupButton setup={snapshot.setup} color={agent.color} />}
      </div>

      <div className="agents-card-col agents-tokens">
        <span className="agents-section-label">{tr("agents.tokensToday")}</span>
        <motion.span key={formatTokens(total)} className="agents-tokens-total" initial={{ opacity: 0.4 }} animate={{ opacity: 1 }}>
          {formatTokens(total)}
        </motion.span>
        {t && (
          <dl className="agents-tokens-grid">
            <dt>{tr("agents.tokens.input")}</dt>
            <dd>{formatTokens(t.input)}</dd>
            <dt>{tr("agents.tokens.output")}</dt>
            <dd>{formatTokens(t.output)}</dd>
            <dt>{tr("agents.tokens.cacheRead")}</dt>
            <dd>{formatTokens(t.cacheRead)}</dd>
            <dt>{tr("agents.tokens.cacheWrite")}</dt>
            <dd>{formatTokens(t.cacheWrite)}</dd>
          </dl>
        )}
      </div>
    </div>
  );
}

function SetupButton({ setup, color }: { setup: NonNullable<AgentSnapshot["setup"]>; color: string }) {
  const t = useT();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  return (
    <div className="agents-setup">
      <p>{setup.message}</p>
      <motion.button
        className="agents-setup-btn"
        style={{ background: color }}
        whileTap={{ scale: 0.94 }}
        disabled={state === "busy"}
        onClick={async (e) => {
          e.stopPropagation();
          setState("busy");
          try {
            await setup.action();
            setState("idle");
          } catch {
            setState("error");
          }
        }}
      >
        {state === "busy" ? t("agents.setup.busy") : state === "error" ? t("agents.setup.failed") : setup.actionLabel}
      </motion.button>
    </div>
  );
}

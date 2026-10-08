import { useState } from "react";
import { useT } from "../../../../core/i18n";
import { formatAgo } from "../format";
import type { AgentSessionRef, PermissionDecision } from "../types";
import { StatusGlyph } from "./StatusGlyph";

/**
 * A permission request answered from the island: what the agent wants to do
 * and Allow / Always / Deny. Answering in the terminal or the editor still
 * works; the request then just goes away.
 */
export function PermissionPrompt({ item, now, more }: { item: AgentSessionRef; now: number; more: number }) {
  const t = useT();
  const { agent, session } = item;
  const request = session.permission!;
  const [busy, setBusy] = useState<PermissionDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: PermissionDecision) => {
    if (!agent.decide) return;
    setBusy(decision);
    setError(null);
    try {
      await agent.decide(session, decision);
    } catch (e) {
      setError(String(e));
      setBusy(null);
    }
  };

  return (
    <div className="agents-permission" style={{ "--agent": agent.color } as React.CSSProperties}>
      <div className="agents-permission-head">
        <StatusGlyph agent={agent} status="waiting" size={16} />
        <span className="agents-permission-title">
          {t("agents.permission.title", { project: session.title || agent.name, tool: request.tool })}
        </span>
        {more > 0 && <span className="agents-permission-more">{t("agents.permission.more", { n: more })}</span>}
        <span className="agents-permission-time">{formatAgo(t, request.since, now)}</span>
      </div>
      {request.detail && (
        <pre className="agents-permission-detail" data-scroll>
          {request.detail}
        </pre>
      )}
      <div className="agents-permission-actions">
        <button className="agents-permission-btn is-allow" disabled={!!busy} onClick={() => decide("allow")}>
          {busy === "allow" ? "…" : t("agents.permission.allow")}
        </button>
        {request.always && (
          <button
            className="agents-permission-btn is-always"
            disabled={!!busy}
            title={t("agents.permission.alwaysTitle", { rule: request.always })}
            onClick={() => decide("always")}
          >
            {busy === "always" ? "…" : t("agents.permission.always")}
          </button>
        )}
        <button className="agents-permission-btn is-deny" disabled={!!busy} onClick={() => decide("deny")}>
          {busy === "deny" ? "…" : t("agents.permission.deny")}
        </button>
        {error ? (
          <span className="agents-permission-error">{error}</span>
        ) : (
          <span className="agents-permission-hint">{t("agents.permission.hint")}</span>
        )}
      </div>
    </div>
  );
}

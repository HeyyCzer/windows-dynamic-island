import { AnimatePresence, motion } from "motion/react";
import { useT } from "../../../../core/i18n";
import { formatAgo, formatElapsed } from "../format";
import type { AgentSessionRef } from "../types";
import { StatusGlyph } from "./StatusGlyph";

/** "Now" list: every recent session across agents, busiest first. */
export function SessionList({ items, now }: { items: AgentSessionRef[]; now: number }) {
  const t = useT();
  if (!items.length) {
    return <div className="agents-empty">{t("agents.noSessions")}</div>;
  }

  return (
    <ul className="agents-sessions">
      <AnimatePresence initial={false}>
        {items.map(({ agent, session }) => {
          const running = session.status === "working" || session.status === "waiting";
          const time = running && session.turnStartedAt
            ? formatElapsed(now - session.turnStartedAt)
            : formatAgo(t, session.finishedAt ?? session.lastEventAt, now);
          return (
            <motion.li
              key={`${agent.id}:${session.id}`}
              layout
              className={`agents-session is-${session.status}`}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            >
              <StatusGlyph agent={agent} status={session.status} size={14} />
              <span className="agents-session-title">{session.title || agent.name}</span>
              <span className="agents-session-activity">{session.activity}</span>
              {session.contextPct != null && (
                <span className="agents-session-ctx" title={t("agents.contextUsed")}>
                  {Math.round(session.contextPct)}%
                </span>
              )}
              <span className="agents-session-time" style={{ color: running ? agent.color : undefined }}>
                {time}
              </span>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

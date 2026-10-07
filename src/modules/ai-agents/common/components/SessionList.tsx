import { AnimatePresence, motion } from "motion/react";
import { useT } from "../../../../core/i18n";
import { formatAgo, formatElapsed } from "../format";
import type { AgentSessionRef } from "../types";
import { StatusDot, StatusGlyph } from "./StatusGlyph";

/**
 * "Now" list: every recent session across agents, busiest first. With a
 * single agent the rows show only their state (the card above already says
 * which agent it is); the agent icon comes back when several are listed.
 */
export function SessionList({ items, now, showAgent }: { items: AgentSessionRef[]; now: number; showAgent: boolean }) {
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
              className={`agents-session is-${session.status} ${agent.openSession && session.cwd ? "is-clickable" : ""}`}
              title={agent.openSession && session.cwd ? t("agents.openProject") : undefined}
              onClick={(e) => {
                if (!agent.openSession || !session.cwd) return;
                e.stopPropagation();
                agent.openSession(session);
              }}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            >
              {showAgent ? (
                <StatusGlyph agent={agent} status={session.status} size={14} />
              ) : (
                <StatusDot status={session.status} color={agent.color} />
              )}
              <span className="agents-session-title">{session.title || agent.name}</span>
              <span className="agents-session-activity" title={detail(session) ?? undefined}>
                {/* Busy: what it's doing. Otherwise what it was asked, which tells apart sessions of one project. */}
                {running ? session.activity : (session.prompt ?? session.summary ?? session.activity)}
              </span>
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

/** Tooltip: the prompt and how the reply started. */
function detail(session: AgentSessionRef["session"]) {
  const parts = [session.prompt && `> ${session.prompt}`, session.summary ?? session.activity].filter(Boolean);
  return parts.length ? parts.join("\n\n") : null;
}

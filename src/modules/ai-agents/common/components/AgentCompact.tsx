import { AnimatePresence, motion } from "motion/react";
import { formatElapsed, useNow } from "../format";
import type { AgentSessionRef } from "../types";
import { StatusGlyph } from "./StatusGlyph";

const STATUS_TEXT = { working: "Trabalhando", waiting: "Aguardando você", done: "Concluído", idle: "" };

/** Left slot of the compact pill: animated agent glyph + what it's doing. */
export function AgentCompactLeft({ hot, busyCount }: { hot: AgentSessionRef; busyCount: number }) {
  const { agent, session } = hot;
  const label = session.status === "working" ? (session.activity ?? STATUS_TEXT.working) : STATUS_TEXT[session.status];

  return (
    <>
      <StatusGlyph agent={agent} status={session.status} size={18} />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={label}
          className={`agents-compact-label is-${session.status}`}
          initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
          transition={{ duration: 0.25 }}
        >
          {label}
        </motion.span>
      </AnimatePresence>
      {busyCount > 1 && <span className="agents-count">{busyCount}</span>}
    </>
  );
}

/** Right slot: live turn timer (or final duration when done). */
export function AgentCompactRight({ hot }: { hot: AgentSessionRef }) {
  const { session } = hot;
  const running = session.status === "working" || session.status === "waiting";
  const now = useNow(1000, running);
  if (!session.turnStartedAt) return null;
  const end = running ? now : (session.finishedAt ?? now);

  return (
    <span className={`agents-timer is-${session.status}`} style={{ color: running ? hot.agent.color : undefined }}>
      {formatElapsed(end - session.turnStartedAt)}
    </span>
  );
}

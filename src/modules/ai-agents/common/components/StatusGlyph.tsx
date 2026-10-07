import { motion } from "motion/react";
import type { AgentDefinition, AgentStatus } from "../types";

/**
 * Just the state, for lists where every row is the same agent: a spinning
 * arc while working, a pulsing amber dot while waiting, a green check when
 * done, a dim dot when idle.
 */
export function StatusDot({ status, color, size = 14 }: { status: AgentStatus; color: string; size?: number }) {
  if (status === "working") {
    return (
      <motion.svg
        className="agents-dot"
        width={size}
        height={size}
        viewBox="0 0 14 14"
        animate={{ rotate: 360 }}
        transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
      >
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
        <path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      </motion.svg>
    );
  }
  if (status === "done") {
    return (
      <span className="agents-dot is-done" style={{ width: size, height: size }}>
        <svg width={size - 5} height={size - 5} viewBox="0 0 12 12">
          <path d="M2.5 6.5l2.2 2.2 4.8-5" fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className="agents-dot" style={{ width: size, height: size }}>
      {status === "waiting" && (
        <motion.span
          className="agents-glyph-halo"
          animate={{ scale: [1, 2], opacity: [0.6, 0] }}
          transition={{ duration: 1.3, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span className={`agents-dot-core is-${status}`} />
    </span>
  );
}

/**
 * Agent icon with a state animation: slow spin while working, a pulsing
 * amber halo while waiting for the user, a green check pop when done.
 */
export function StatusGlyph({ agent, status, size = 20 }: { agent: AgentDefinition; status: AgentStatus; size?: number }) {
  return (
    <div className="agents-glyph" style={{ width: size, height: size }}>
      {status === "waiting" && (
        <motion.span
          className="agents-glyph-halo"
          animate={{ scale: [1, 1.9], opacity: [0.7, 0] }}
          transition={{ duration: 1.3, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <motion.div
        style={{ display: "grid", color: agent.color }}
        animate={
          status === "working"
            ? { rotate: 360, scale: 1 }
            : status === "waiting"
              ? { rotate: 0, scale: [1, 1.12, 1] }
              : { rotate: 0, scale: 1 }
        }
        transition={
          status === "working"
            ? { rotate: { duration: 3.2, repeat: Infinity, ease: "linear" } }
            : status === "waiting"
              ? { scale: { duration: 1.3, repeat: Infinity } }
              : { type: "spring", stiffness: 300, damping: 20 }
        }
      >
        <agent.Icon size={size} state={status} />
      </motion.div>
      {status === "done" && (
        <motion.span
          className="agents-glyph-check"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.1 }}
        >
          <svg width="8" height="8" viewBox="0 0 12 12">
            <path d="M2.5 6.5l2.2 2.2 4.8-5" fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.span>
      )}
    </div>
  );
}

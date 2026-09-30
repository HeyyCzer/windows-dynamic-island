import { motion } from "motion/react";
import type { AgentDefinition, AgentStatus } from "../types";

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

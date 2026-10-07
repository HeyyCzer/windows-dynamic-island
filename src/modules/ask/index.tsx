/**
 * Ask Claude — a conversation with Claude (through the Claude Code CLI and
 * the user's own login) right in the island. Ctrl+Alt+Space opens it from
 * anywhere; the camera button attaches a screenshot of the window you were in,
 * and files dropped on it (or sent from the shelf) become attachments.
 * Backend: `src-tauri/src/providers/ask/`.
 */
import { motion } from "motion/react";
import { useProvider } from "../../core/bridge";
import { useT } from "../../core/i18n";
import type { IslandModule, ModuleView } from "../../core/types";
import { ClaudeIcon } from "../ai-agents/claude/ClaudeIcon";
import { AskPanel, statusText } from "./components/AskPanel";
import { ASK_PROVIDER, CLAUDE_ORANGE, pendingAttachments, type AskState } from "./store";
import "./ask.css";

export const askModule: IslandModule = {
  id: "ask",
  title: "ask.title",
  settingsIcon: (
    <span style={{ color: CLAUDE_ORANGE, display: "grid" }}>
      <ClaudeIcon size={15} />
    </span>
  ),
  useView(): ModuleView {
    const state = useProvider<AskState>(ASK_PROVIDER);
    const attachments = pendingAttachments.use();
    const t = useT();
    const running = !!state?.running;
    const messages = state?.messages.length ?? 0;

    const glyph = (size: number) => (
      <motion.span
        style={{ color: CLAUDE_ORANGE, display: "grid" }}
        animate={running ? { rotate: 360 } : { rotate: 0 }}
        transition={running ? { duration: 2.4, repeat: Infinity, ease: "linear" } : { duration: 0.3 }}
      >
        <ClaudeIcon size={size} />
      </motion.span>
    );

    return {
      // While Claude answers, it holds a spot in the compact island.
      active: running,
      priority: 60,
      accent: CLAUDE_ORANGE,
      icon: glyph(16),
      compact: running
        ? {
            left: (
              <>
                {glyph(18)}
                <span className="ask-compact-title">Claude</span>
              </>
            ),
            right: <span className="ask-compact-status">{state?.status ? statusText(t, state.status) : ""}</span>,
            width: 320,
          }
        : undefined,
      expanded: <AskPanel state={state} />,
      expandedSize: { width: 560, height: messages ? 340 : attachments.length ? 190 : 150 },
    };
  },
};

/**
 * Claude Code agent. Backend: `src-tauri/src/providers/claude/`.
 */
import type { AgentDefinition } from "../common/types";
import { ClaudeIcon } from "./ClaudeIcon";
import { ClaudeSettings } from "./ClaudeSettings";
import { useClaude } from "./useClaude";

export const claudeAgent: AgentDefinition = {
  id: "claude",
  name: "Claude",
  color: "#D97757",
  Icon: ClaudeIcon,
  useAgent: useClaude,
  SettingsSection: ClaudeSettings,
};

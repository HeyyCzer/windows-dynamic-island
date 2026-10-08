/**
 * OpenAI Codex agent. Backend: `src-tauri/src/providers/codex/`.
 */
import { providerAction } from "../../../core/bridge";
import type { AgentDefinition } from "../common/types";
import { CodexIcon } from "./CodexIcon";
import { CodexSettings } from "./CodexSettings";
import { useCodex } from "./useCodex";

export const codexAgent: AgentDefinition = {
  id: "codex",
  name: "Codex",
  color: "#8B9CFF",
  Icon: CodexIcon,
  useAgent: useCodex,
  usageUrl: "https://chatgpt.com/codex/settings/usage",
  openSession: (session) => {
    if (session.cwd) providerAction("codex", "openProject", session.cwd);
  },
  SettingsSection: CodexSettings,
};

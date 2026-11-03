/**
 * Google Antigravity: plan quota read from the app's local language server.
 * Backend: `src-tauri/src/providers/antigravity.rs`.
 */
import type { AgentDefinition } from "../common/types";
import { AntigravityIcon } from "./AntigravityIcon";
import { AntigravitySettings } from "./AntigravitySettings";
import { useAntigravity } from "./useAntigravity";

export const antigravityAgent: AgentDefinition = {
	id: "antigravity",
	name: "Antigravity",
	color: "#388BFD",
	Icon: AntigravityIcon,
	useAgent: useAntigravity,
	SettingsSection: AntigravitySettings,
};

import { providerAction } from "../../../core/bridge";
import type { AgentDefinition } from "../common/types";
import { AntigravityIcon } from "./AntigravityIcon";
import { useGemini } from "./useGemini";

export const geminiAgent: AgentDefinition = {
	id: "gemini",
	name: "Antigravity",
	color: "#388BFD",
	Icon: AntigravityIcon,
	useAgent: useGemini,
	usageUrl: "https://aistudio.google.com",
	launchApp: () => providerAction("gemini", "launch").then(() => {}),
};

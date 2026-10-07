import type { SettingDef } from "../../core/settings";

export const agentSettings = {
	/** Also read by the backend (`providers/claude/permissions.rs`). */
	approveInIsland: {
		key: "agents.approveInIsland",
		label: "agents.approveInIsland.label",
		description: "agents.approveInIsland.desc",
		default: true,
	},
	peekOnWaiting: {
		key: "agents.peekOnWaiting.label",
		label: "agents.peekOnWaiting.label",
		description: "agents.peekOnWaiting.desc",
		default: true,
	},
	peekOnDone: {
		key: "agents.peekOnDone.label",
		label: "agents.peekOnDone.label",
		default: false,
	},
	peekOnLimitsReset: {
		key: "agents.peekOnLimitsReset.label",
		label: "agents.peekOnLimitsReset.label",
		description: "agents.peekOnLimitsReset.desc",
		default: true,
	},
} satisfies Record<string, SettingDef>;

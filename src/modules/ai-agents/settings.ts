import type { SettingDef } from "../../core/settings";

export const agentSettings = {
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

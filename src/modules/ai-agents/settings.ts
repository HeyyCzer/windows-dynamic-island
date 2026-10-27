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

/**
 * Sounds for a session that finished or asks for permission, with the audio
 * file to play (`null`: the one shipped with the app). Read by the backend
 * (`providers/claude/sounds.rs`); shown in `ClaudeSettings`.
 */
export const claudeSounds = {
	done: {
		enabled: { key: "agents.soundDone", label: "claude.sound.done", default: false } as SettingDef,
		file: { key: "agents.soundDoneFile", label: "claude.sound.done", default: null } as SettingDef<string | null>,
	},
	permission: {
		enabled: { key: "agents.soundPermission", label: "claude.sound.permission", default: false } as SettingDef,
		file: { key: "agents.soundPermissionFile", label: "claude.sound.permission", default: null } as SettingDef<
			string | null
		>,
	},
};

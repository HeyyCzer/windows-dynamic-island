import type { SettingDef } from "../../core/settings";

export const musicSettings = {
	autoExpand: {
		key: "music.autoExpand.label",
		label: "music.autoExpand.label",
		description: "music.autoExpand.desc",
		default: false,
	},
	visualizer: {
		key: "music.visualizer.label",
		label: "music.visualizer.label",
		description: "music.visualizer.desc",
		default: true,
	},
	// Read by the backend too (`smtc.rs`): off means no YouTube lookups at all.
	video: {
		key: "music.video.label",
		label: "music.video.label",
		description: "music.video.desc",
		default: false,
	},
} satisfies Record<string, SettingDef>;

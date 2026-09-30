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
} satisfies Record<string, SettingDef>;

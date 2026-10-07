import type { SettingDef } from "../../core/settings";

export const clipboardSettings = {
  showOnCopy: {
    key: "clipboard.showOnCopy",
    label: "clipboard.showOnCopy.label",
    description: "clipboard.showOnCopy.desc",
    default: true,
  },
  peekOnScreenshot: {
    key: "clipboard.peekOnScreenshot",
    label: "clipboard.peekOnScreenshot.label",
    description: "clipboard.peekOnScreenshot.desc",
    default: true,
  },
} satisfies Record<string, SettingDef>;

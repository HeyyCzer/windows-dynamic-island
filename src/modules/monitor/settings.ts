import type { SettingDef } from "../../core/settings";

/** Also read by the backend (`src-tauri/src/providers/monitor/mod.rs`). */
export const systemMonitorSettings = {
  alerts: {
    key: "monitor.alerts",
    label: "monitor.alerts.label",
    description: "monitor.alerts.desc",
    default: true,
  },
  showBubble: {
    key: "monitor.showBubble",
    label: "monitor.showBubble.label",
    description: "monitor.showBubble.desc",
    default: false,
  },
} satisfies Record<string, SettingDef>;

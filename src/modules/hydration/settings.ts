import type { SettingDef } from "../../core/settings";

/** Switches rendered directly in the module settings page. */
export const hydrationSettings = {
  autoStart: {
    key: "hydration.autoStart",
    label: "hydration.autoStart.label",
    description: "hydration.autoStart.desc",
    default: true,
  },
  showBubble: {
    key: "hydration.showBubble",
    label: "hydration.showBubble.label",
    description: "hydration.showBubble.desc",
    default: false,
  },
} satisfies Record<string, SettingDef>;

/** Minutes between two hydration reminders. */
export const hydrationInterval: SettingDef<number> = {
  key: "hydration.intervalMinutes",
  label: "hydration.interval.label",
  description: "hydration.interval.desc",
  default: 30,
};

/** Minutes to wait when the user postpones a reminder. */
export const hydrationSnooze: SettingDef<number> = {
  key: "hydration.snoozeMinutes",
  label: "hydration.snooze.label",
  description: "hydration.snooze.desc",
  default: 10,
};

import type { SettingDef } from "../../core/settings";

/** Which kinds of alerts show up; the backend always produces them. */
export const activitySettings = {
  volume: {
    key: "activities.volume",
    label: "activities.volume.label",
    description: "activities.volume.desc",
    default: true,
  },
  battery: {
    key: "activities.battery",
    label: "activities.battery.label",
    description: "activities.battery.desc",
    default: true,
  },
  bluetooth: {
    key: "activities.bluetooth",
    label: "activities.bluetooth.label",
    description: "activities.bluetooth.desc",
    default: true,
  },
  api: {
    key: "activities.api",
    label: "activities.api.label",
    description: "activities.api.desc",
    default: true,
  },
} satisfies Record<string, SettingDef>;

/** Activity `source` → the setting that shows it (other sources belong to their own modules). */
export const SOURCE_SETTING: Record<string, SettingDef> = {
  volume: activitySettings.volume,
  battery: activitySettings.battery,
  bluetooth: activitySettings.bluetooth,
};

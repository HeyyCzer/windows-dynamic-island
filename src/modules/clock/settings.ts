import type { SettingDef } from "../../core/settings";

export const calendarSettings = {
  remind: {
    key: "calendar.remind",
    label: "calendar.remind.label",
    description: "calendar.remind.desc",
    default: true,
  },
} satisfies Record<string, SettingDef>;

/** Minutes before an event its reminder shows. */
export const remindMinutes: SettingDef<number> = {
  key: "calendar.remindMinutes",
  label: "calendar.remindMinutes.label",
  default: 10,
};

/** Calendar key → shown, overriding its default; also read by the backend. */
export const calendarVisibility: SettingDef<Record<string, boolean>> = {
  key: "calendar.visibility",
  label: "calendar.calendars.title",
  default: {},
};

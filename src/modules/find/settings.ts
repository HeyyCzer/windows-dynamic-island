import type { SettingDef } from "../../core/settings";

/** Also read by the backend (`src-tauri/src/providers/find/mod.rs`). */
export const findSettings = {
  moveCursor: {
    key: "find.moveCursor",
    label: "find.moveCursor.label",
    description: "find.moveCursor.desc",
    default: true,
  },
} satisfies Record<string, SettingDef>;

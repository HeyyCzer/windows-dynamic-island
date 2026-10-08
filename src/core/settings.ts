/**
 * Settings store shared by every window.
 *
 * Values live in the backend (`src-tauri/src/settings.rs`) as a flat key/value
 * map; the schema lives here in the frontend: each setting is a `SettingDef`
 * declared next to the code that uses it (core or a module), carrying its own
 * default. Outside Tauri, values fall back to localStorage.
 */
import { useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import { command, isTauri } from "./bridge";
import type { MessageKey } from "./i18n";

export interface SettingDef<T = boolean> {
  key: string;
  /** Translation keys (see `src/locales`). */
  label: MessageKey;
  description?: MessageKey;
  default: T;
}

type Values = Record<string, unknown>;

let values: Values = {};
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const LOCAL_KEY = "island-settings";

let started = false;
export async function startSettings() {
  if (started) return;
  started = true;
  if (!isTauri) {
    try {
      values = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}");
    } catch {
      values = {};
    }
    notify();
    return;
  }
  await listen<Values>("settings://changed", (e) => {
    values = e.payload;
    notify();
  });
  values = (await command<Values>("get_settings")) ?? {};
  notify();
}

export function readSetting<T>(all: Values, def: SettingDef<T>): T {
  return (def.key in all ? all[def.key] : def.default) as T;
}

/** Whole settings map (re-renders on any change). */
export function useSettings(): Values {
  return useSyncExternalStore(subscribe, () => values);
}

export function useSetting<T>(def: SettingDef<T>): T {
  return readSetting(useSettings(), def);
}

export function setSetting<T>(def: SettingDef<T> | string, value: T) {
  const key = typeof def === "string" ? def : def.key;
  values = { ...values, [key]: value }; // optimistic
  notify();
  if (isTauri) {
    command("set_setting", { key, value });
  } else {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(values));
    } catch {
      /* preview only */
    }
  }
}

/** Every module gets an on/off switch. */
export const moduleEnabled = (id: string, title: MessageKey): SettingDef => ({
  key: `module.${id}.enabled`,
  label: title,
  default: true,
});

export const generalSettings = {
  hideInFullscreen: {
    key: "island.hideInFullscreen",
    label: "settings.hideInFullscreen.label",
    description: "settings.hideInFullscreen.desc",
    default: true,
  },
  expandOnHover: {
    key: "island.expandOnHover",
    label: "settings.expandOnHover.label",
    description: "settings.expandOnHover.desc",
    default: true,
  },
} satisfies Record<string, SettingDef>;

/**
 * Tabs of the open island: their order, and which ones sit in the tab bar.
 * Every enabled module is also in the launcher (the grid button), so the bar
 * can stay short however many modules there are.
 */
export const layoutSettings = {
  /** Module ids in tab order; modules missing from it follow in registry order. */
  order: {
    key: "island.order",
    label: "modules.title",
    default: [],
  } satisfies SettingDef<string[]>,
  /** Module ids shown in the tab bar (a busy module shows up there anyway). */
  pinned: {
    key: "island.pinned",
    label: "layout.pinned",
    default: ["music", "ai-agents", "ask", "notifications", "clipboard", "monitor", "clock"],
  } satisfies SettingDef<string[]>,
  /** Module ids kept in the tab bar even when they have nothing to show (e.g. an empty shelf). */
  pinnedAlways: {
    key: "island.pinnedAlways",
    label: "layout.pinned",
    default: [] as string[],
  } satisfies SettingDef<string[]>,
};

/** Where a module's tab goes: the launcher only, the tab bar, or the tab bar even when empty. */
export type Placement = "launcher" | "bar" | "always";

export function placementOf(values: Record<string, unknown>, id: string): Placement {
  if (readSetting(values, layoutSettings.pinnedAlways).includes(id)) return "always";
  return readSetting(values, layoutSettings.pinned).includes(id) ? "bar" : "launcher";
}

export function setPlacement(values: Record<string, unknown>, id: string, placement: Placement) {
  const without = (list: string[]) => list.filter((p) => p !== id);
  const pinned = without(readSetting(values, layoutSettings.pinned));
  const always = without(readSetting(values, layoutSettings.pinnedAlways));
  setSetting(layoutSettings.pinned, placement === "bar" ? [...pinned, id] : pinned);
  setSetting(layoutSettings.pinnedAlways, placement === "always" ? [...always, id] : always);
}

/** `items` sorted by the saved order; unknown ones keep their place at the end. */
export function inOrder<T>(items: T[], idOf: (item: T) => string, order: string[]): T[] {
  const rank = (item: T) => {
    const i = order.indexOf(idOf(item));
    return i === -1 ? order.length + items.indexOf(item) : i;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}

/** Where the island goes after being dragged along the top edge. */
export const positionSettings = {
  returnToCenter: {
    key: "island.returnToCenter",
    label: "settings.returnToCenter.label",
    description: "settings.returnToCenter.desc",
    default: true,
  } satisfies SettingDef,
  returnDelay: {
    key: "island.returnDelay",
    label: "settings.returnDelay.label",
    description: "settings.returnDelay.desc",
    default: 5,
  } satisfies SettingDef<number>,
};

/**
 * Which monitor the island lives on (applied by the backend, `display.rs`).
 * `monitor` is "primary" (follows Windows' primary monitor) or a monitor id
 * from the `list_monitors` command.
 */
export const monitorSettings = {
  monitor: {
    key: "island.monitor",
    label: "settings.monitor.label",
    description: "settings.monitor.desc",
    default: "primary",
  } satisfies SettingDef<string>,
  avoidMaximized: {
    key: "island.avoidMaximized",
    label: "settings.avoidMaximized.label",
    description: "settings.avoidMaximized.desc",
    default: false,
  } satisfies SettingDef,
};

/** Last drag offset from the center in CSS px (kept only when not returning). */
export const ISLAND_OFFSET_KEY = "island.offset";

/** Swallowed by the tray's black hole; written by the backend (`tray.rs`). */
export const ISLAND_HIDDEN_KEY = "island.hidden";

/**
 * Look of the island:
 * - `dynamic`: hangs from the top edge with concave "ears", like the notch.
 * - `windows`: a floating pill with rounded corners, a tab bar at the bottom,
 *   a clock at rest and an optional gradient rim (Windows Island's look).
 */
export type IslandStyle = "dynamic" | "windows";

export const appearanceSettings = {
  style: {
    key: "appearance.style",
    label: "appearance.style.label",
    description: "appearance.style.desc",
    default: "dynamic",
  } as SettingDef<IslandStyle>,
  /** A preset id from `core/appearance.ts`, "none" (classic hairline) or "custom". */
  border: {
    key: "appearance.border",
    label: "appearance.border.label",
    description: "appearance.border.desc",
    default: "none",
  } satisfies SettingDef<string>,
  customColors: {
    key: "appearance.customColors",
    label: "appearance.custom.label",
    default: ["#BF5AF2", "#64D2FF"],
  } satisfies SettingDef<string[]>,
  thickness: {
    key: "appearance.borderThickness",
    label: "appearance.thickness.label",
    default: 2,
  } satisfies SettingDef<number>,
  animate: {
    key: "appearance.animateBorder",
    label: "appearance.animate.label",
    description: "appearance.animate.desc",
    default: false,
  } satisfies SettingDef,
  glow: {
    key: "appearance.glow",
    label: "appearance.glow.label",
    description: "appearance.glow.desc",
    default: true,
  } satisfies SettingDef,
  idleClock: {
    key: "appearance.idleClock",
    label: "appearance.idleClock.label",
    description: "appearance.idleClock.desc",
    default: true,
  } satisfies SettingDef,
};

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

/** Last drag offset from the center in CSS px (kept only when not returning). */
export const ISLAND_OFFSET_KEY = "island.offset";

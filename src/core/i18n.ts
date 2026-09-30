/**
 * Translations. Every `src/locales/<code>.json5` is a language (the file name
 * is its BCP 47 code, `language.name` its display name); dropping in a new file
 * is all it takes to add one. Nested keys are flattened to dotted ones by
 * `vite-plugin-locales.ts`. `en.json5` is the reference: other locales should
 * have the same keys, missing ones fall back to English. The same files are
 * embedded in the backend (`src-tauri/src/i18n.rs`).
 *
 * The language is a setting: "auto" (default) follows the system language,
 * falling back to English when it isn't available.
 */
import { useEffect } from "react";
import en from "../locales/en.json5";
import type { MessageKey } from "../locales/keys.gen";
import { command } from "./bridge";
import { readSetting, useSettings, type SettingDef } from "./settings";

export type { MessageKey };
type Messages = Partial<Record<MessageKey, string>>;

const files = import.meta.glob<Messages>("../locales/*.json5", { eager: true, import: "default" });

export const locales: Record<string, { name: string; messages: Messages }> = Object.fromEntries(
  Object.entries(files).map(([path, messages]) => {
    const code = path.match(/([^/]+)\.json5$/)![1];
    return [code, { name: messages["language.name"] ?? code, messages }];
  }),
);

if (import.meta.env.DEV) {
  for (const [code, { messages }] of Object.entries(locales)) {
    const missing = Object.keys(en).filter((k) => !(k in messages));
    if (missing.length) console.warn(`[i18n] ${code} is missing ${missing.length} keys:`, missing);
  }
}

/** A code from `locales`, or "auto". */
export type LanguagePref = string;

export const languageSetting: SettingDef<LanguagePref> = {
  key: "app.language",
  label: "settings.language.label",
  description: "settings.language.desc",
  default: "auto",
};

/** Best available match for the system (WebView) language. */
export function systemLocale(): string {
  const codes = navigator.languages?.length ? navigator.languages : [navigator.language];
  const available = Object.keys(locales);
  const base = (code: string) => code.split("-")[0].toLowerCase();
  for (const code of codes) {
    const match =
      available.find((l) => l.toLowerCase() === code.toLowerCase()) ??
      available.find((l) => base(l) === base(code));
    if (match) return match;
  }
  return "en";
}

export function resolveLocale(pref: LanguagePref): string {
  return pref !== "auto" && pref in locales ? pref : systemLocale();
}

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function translator(locale: string): Translate {
  const messages: Messages = locales[locale]?.messages ?? en;
  return (key, vars) => {
    const text = messages[key] ?? (en as Messages)[key] ?? key;
    return vars ? text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : text;
  };
}

export function useLocale(): string {
  return resolveLocale(readSetting(useSettings(), languageSetting));
}

/** `t()` for the active language; re-renders when it changes. */
export function useT(): Translate {
  return translator(useLocale());
}

/** Keeps `<html lang>` and the backend's strings (tray, window titles) in sync. */
export function useSyncLocale() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
    command("set_locale", { code: locale });
  }, [locale]);
}

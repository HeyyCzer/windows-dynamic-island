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
import { useEffect, useSyncExternalStore } from "react";
import en from "../locales/en.json5";
import type { MessageKey } from "../locales/keys.gen";
import { command } from "./bridge";
import { readSetting, type SettingDef, useSettings } from "./settings";

export type { MessageKey };

type Messages = Partial<Record<MessageKey, string>>;

const files = import.meta.glob<Messages>("../locales/*.json5", { eager: true, import: "default" });

export const locales: Record<string, { name: string; messages: Messages }> = Object.fromEntries(
	Object.entries(files).map(([path, messages]) => {
		const code = path.match(/([^/]+)\.json5$/)?.[1] ?? path;
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
			available.find((l) => l.toLowerCase() === code.toLowerCase()) ?? available.find((l) => base(l) === base(code));
		if (match) return match;
	}
	return "en";
}

export function resolveLocale(pref: LanguagePref): string {
	return pref !== "auto" && pref in locales ? pref : systemLocale();
}

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * Plugins' strings, by locale, under `plugin.<id>.<key>` (see
 * `core/plugins/store.ts`). They go through the same `t()` as the app's own,
 * so a plugin module's title renders wherever a module title does.
 */
let pluginMessages: Record<string, Record<string, string>> = {};
let pluginMessagesVersion = 0;
const pluginMessageListeners = new Set<() => void>();
const subscribePluginMessages = (l: () => void) => {
	pluginMessageListeners.add(l);
	return () => void pluginMessageListeners.delete(l);
};

export function setPluginMessages(messages: Record<string, Record<string, string>>) {
	pluginMessages = messages;
	pluginMessagesVersion++;
	for (const l of pluginMessageListeners) l();
}

/** The best of `available` for `locale`: exact, then same language, else English. */
export function matchLocale(locale: string, available: string[]): string[] {
	const base = (code: string) => code.split("-")[0].toLowerCase();
	const exact = available.find((c) => c.toLowerCase() === locale.toLowerCase());
	const sameLanguage = available.find((c) => base(c) === base(locale));
	return [exact, sameLanguage, "en"].filter((c, i, all): c is string => !!c && all.indexOf(c) === i);
}

export function translator(locale: string): Translate {
	const messages: Messages = locales[locale]?.messages ?? en;
	const plugin = matchLocale(locale, Object.keys(pluginMessages)).map((code) => pluginMessages[code] ?? {});
	const fromPlugins = (key: string) => {
		for (const m of plugin) if (key in m) return m[key];
		return undefined;
	};
	return (key, vars) => {
		const text = messages[key] ?? (en as Messages)[key] ?? fromPlugins(key) ?? key;
		return vars ? text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : text;
	};
}

export function useLocale(): string {
	return resolveLocale(readSetting(useSettings(), languageSetting));
}

/** `t()` for the active language; re-renders when it changes (or plugins do). */
export function useT(): Translate {
	useSyncExternalStore(subscribePluginMessages, () => pluginMessagesVersion);
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

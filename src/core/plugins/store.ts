/**
 * Installed plugins, as the backend reports them (`plugins_list`), shared by
 * every window and refreshed on `plugins://changed`. Outside Tauri the dev
 * mock serves the example plugins instead (see `dev/mock/plugins.ts`).
 */
import { useSyncExternalStore } from "react";
import { command, isTauri, onEvent } from "../bridge";
import type { MessageKey } from "../i18n";
import { setPluginMessages } from "../i18n";
import type { SettingDef } from "../settings";
import type { PluginInfo } from "./types";

export const PLUGINS_CHANGED = "plugins://changed";

let plugins: PluginInfo[] = [];
/** Bumped on every refresh: frames reload when their plugin may have changed. */
let generation = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
	listeners.add(l);
	return () => void listeners.delete(l);
};

/** Sets the list (backend answer or mock) and the strings that go with it. */
export function setPlugins(list: PluginInfo[]) {
	plugins = list;
	generation++;
	const messages: Record<string, Record<string, string>> = {};
	for (const plugin of list) {
		for (const [locale, entries] of Object.entries(plugin.messages)) {
			messages[locale] ??= {};
			const into = messages[locale];
			for (const [key, text] of Object.entries(entries)) into[`plugin.${plugin.id}.${key}`] = text;
		}
	}
	setPluginMessages(messages);
	for (const l of listeners) l();
}

export async function refreshPlugins() {
	if (!isTauri) return;
	try {
		setPlugins((await command<PluginInfo[]>("plugins_list")) ?? []);
	} catch (e) {
		console.error("[plugins]", e);
	}
}

let started = false;
export async function startPlugins() {
	if (started) return;
	started = true;
	if (!isTauri) {
		if (import.meta.env.DEV) (await import("../../dev/mock/plugins")).startPluginsMock();
		return;
	}
	onEvent(PLUGINS_CHANGED, () => void refreshPlugins());
	await refreshPlugins();
}

export const getPlugins = () => plugins;
export const usePlugins = () => useSyncExternalStore(subscribe, () => plugins);
export const usePluginGeneration = () => useSyncExternalStore(subscribe, () => generation);

/** A plugin's string, as a key the app's `t()` understands. */
export const pluginKey = (pluginId: string, key: string) => `plugin.${pluginId}.${key}` as MessageKey;

/** The on/off switch of a whole plugin (its modules have their own too). */
export const pluginEnabled = (id: string): SettingDef => ({
	key: `plugin.${id}.enabled`,
	label: "plugins.enabled.label",
	default: true,
});

/** Where a plugin setting lives in the settings map. */
export const pluginSettingKey = (pluginId: string, key: string) => `plugin.${pluginId}.setting.${key}`;

/** The island module id of a plugin's module. */
export const pluginModuleId = (pluginId: string, moduleId: string) => `plugin:${pluginId}:${moduleId}`;

/** The shortcut id (`core/shortcuts.ts`) of a plugin's action. */
export const pluginShortcutId = (pluginId: string, shortcutId: string) => `plugin:${pluginId}:${shortcutId}`;

/**
 * Base URL of the `plugin://` protocol: the webview maps custom schemes to
 * `http://<scheme>.localhost` on Windows. The browser preview serves the
 * example plugins from the dev server.
 */
export function pluginOrigin(): string {
	if (!isTauri) return `${location.origin}/__plugins`;
	return navigator.userAgent.includes("Windows") ? "http://plugin.localhost" : "plugin://localhost";
}

/** URL of a file in a plugin's package. */
export function pluginUrl(pluginId: string, path: string): string {
	const safe = path
		.split("/")
		.filter((p) => p && p !== "." && p !== "..")
		.map(encodeURIComponent)
		.join("/");
	return `${pluginOrigin()}/${pluginId}/${safe}`;
}

/** A plugin that loaded and is switched on. */
export function isRunnable(plugin: PluginInfo, values: Record<string, unknown>): boolean {
	return !!plugin.manifest && !plugin.problem && values[pluginEnabled(plugin.id).key] !== false;
}

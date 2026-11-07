/**
 * Global shortcuts (backend: `src-tauri/src/providers/shortcuts.rs`). Each is
 * a setting holding a combination like "Ctrl+Alt+Space": `null` keeps the
 * default, an empty string turns it off.
 */
import { useProvider } from "./bridge";
import { getPlugins, pluginKey, pluginShortcutId } from "./plugins/store";
import type { SettingDef } from "./settings";

export const SHORTCUTS_PROVIDER = "shortcuts";

export type ShortcutId = string;

/** Mirrors `Status` in `shortcuts.rs`. */
export interface ShortcutStatus {
	/** The combination that works right now. */
	keys: string | null;
	/** The one asked for is held by another app. */
	taken: string | null;
}

export type ShortcutsState = Partial<Record<string, ShortcutStatus>>;

const BUILTIN_SHORTCUTS: Record<string, SettingDef<string | null> & { fallback: string }> = {
	ask: { key: "shortcut.ask", label: "shortcuts.ask", default: null, fallback: "Ctrl+Alt+Space" },
	find: { key: "shortcut.find", label: "shortcuts.find", default: null, fallback: "Ctrl+Alt+F" },
};

export function shortcutSetting(id: ShortcutId): SettingDef<string | null> & { fallback: string } {
	// `plugin:<plugin>:<shortcut>`: a plugin's action, its default from plugin.json.
	if (id.startsWith("plugin:")) {
		const [, pluginId = "", shortcutId = ""] = id.split(":");
		const def = getPlugins()
			.find((p) => p.id === pluginId)
			?.manifest?.shortcuts.find((s) => s.id === shortcutId);
		return {
			key: `shortcut.plugin.${pluginId}.${shortcutId}`,
			label: def ? pluginKey(pluginId, def.label) : "shortcuts.label",
			default: null,
			fallback: def?.default ?? "",
		};
	}
	return (
		BUILTIN_SHORTCUTS[id] ?? {
			key: `shortcut.module.${id.replace(/^module:/, "")}`,
			label: "shortcuts.label",
			default: null,
			fallback: "",
		}
	);
}

/** The shortcut that opens a module: its built-in one, or an opt-in `module:<id>`. */
export const moduleShortcutId = (module: { id: string; shortcut?: ShortcutId }): ShortcutId =>
	module.shortcut ?? `module:${module.id}`;

export function shortcutStateIds(values: Record<string, unknown>): string[] {
	return [
		"ask",
		"find",
		...Object.keys(values)
			.filter((key) => key.startsWith("shortcut.module."))
			.map((key) => `module:${key.slice(16)}`),
		...getPlugins().flatMap((p) => (p.manifest?.shortcuts ?? []).map((s) => pluginShortcutId(p.id, s.id))),
	];
}

/** How a combination reads: Windows calls Super "Win". */
export const showKeys = (keys: string) => keys.replace(/Super/g, "Win");

/** The combination that opens `id` right now, as it reads, if any. */
export function useShortcutKeys(id: ShortcutId): string | null {
	const keys = useProvider<ShortcutsState>(SHORTCUTS_PROVIDER)?.[id]?.keys;
	return keys ? showKeys(keys) : null;
}

const MODIFIER_CODES = ["Control", "Alt", "Shift", "Meta", "OS"];

/** Modifiers held in `e`, in the order the combination is written. */
export function modifiersOf(e: KeyboardEvent): string[] {
	return [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(
		(m): m is string => !!m,
	);
}

/**
 * The combination `e` makes, in the backend's syntax: a key plus at least one
 * modifier (function keys may go alone). `null` while only modifiers are held
 * or for keys the backend doesn't know.
 */
export function comboOf(e: KeyboardEvent): string | null {
	if (MODIFIER_CODES.some((m) => e.code.startsWith(m))) return null;
	const key = e.code
		.replace(/^Key([A-Z])$/, "$1")
		.replace(/^Digit(\d)$/, "$1")
		.replace(/^Numpad(\d)$/, "Num$1");
	if (!key || key === "Unidentified" || key.startsWith("Intl")) return null;
	const mods = modifiersOf(e);
	if (!mods.length && !/^F\d{1,2}$/.test(key)) return null;
	return [...mods, key].join("+");
}

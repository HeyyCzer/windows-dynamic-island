/**
 * Shapes shared with the backend (`src-tauri/src/plugins/`) and the SDK
 * (`packages/plugin-sdk/index.d.ts`). Kept in sync by hand: the Rust structs
 * are the source of truth for the manifest, the SDK for views.
 */

export type SettingType = "boolean" | "number" | "string" | "select";

export interface PluginSettingDef {
	key: string;
	type: SettingType;
	/** Keys into the plugin's locales. */
	label: string;
	description?: string;
	default: unknown;
	min?: number;
	max?: number;
	step?: number;
	unit?: string;
	options?: { value: string; label: string }[];
	secret?: boolean;
}

export interface PluginModuleDef {
	id: string;
	title: string;
	icon?: string;
	panel?: string;
	size?: { width: number; height: number };
	enabledByDefault: boolean;
}

export interface PluginShortcutDef {
	id: string;
	label: string;
	default?: string;
}

/** `plugin.json`, as the backend validated it. */
export interface Manifest {
	id: string;
	version: string;
	sdk: string;
	name: string;
	description?: string;
	author?: string;
	homepage?: string;
	icon?: string;
	background?: string;
	/** The background runs for as long as the plugin is on (otherwise only on events). */
	persistent?: boolean;
	modules: PluginModuleDef[];
	settings: PluginSettingDef[];
	shortcuts: PluginShortcutDef[];
	permissions: string[];
}

/** Locale code → flat key → text. */
export type PluginMessages = Record<string, Record<string, string>>;

/** An installed plugin (`plugins_list`). */
export interface PluginInfo {
	id: string;
	version: string;
	/** Missing when the plugin didn't load (see `problem`). */
	manifest: Manifest | null;
	messages: PluginMessages;
	/** Source id, `null` for a folder loaded in developer mode. */
	source: string | null;
	dev: boolean;
	/** The folder a developer-mode plugin is served from. */
	devPath: string | null;
	granted: string[];
	installedAt: number;
	problem: "tampered" | "invalid" | null;
	error: string | null;
}

/** A string, or one per locale. */
export type LocalizedText = string | Record<string, string>;

export interface PluginSource {
	id: string;
	label: string;
	indexUrl: string;
}

/** A plugin as a source's index lists it (`plugin_catalog`). */
export interface CatalogEntry {
	id: string;
	version: string;
	sdk: string;
	name: LocalizedText;
	description?: LocalizedText;
	author?: string;
	homepage?: string;
	icon?: string;
	permissions: string[];
	/** Keeps a background running (shown in the marketplace). */
	persistent?: boolean;
	package: string;
	sha256: string;
	compatible: boolean;
	installed: string | null;
	update: boolean;
}

export interface CatalogSource {
	source: PluginSource;
	name: LocalizedText | null;
	plugins: CatalogEntry[];
	error: string | null;
}

/** See `Segment` in the SDK. */
export type Segment =
	| string
	| { text?: string; icon?: string; color?: string; bold?: boolean; mono?: boolean; dim?: boolean };

/** See `PluginView` in the SDK. */
export interface PluginView {
	active?: boolean;
	priority?: number;
	compact?: { left?: Segment | Segment[]; right?: Segment | Segment[]; width?: number };
	ambient?: Segment | null;
	icon?: string;
	accent?: string;
	activityKey?: string;
	attention?: boolean;
	hidden?: boolean;
}

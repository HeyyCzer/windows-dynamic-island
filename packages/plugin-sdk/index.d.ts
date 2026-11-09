/**
 * Island for Windows: plugin SDK v1.
 *
 * The app injects the runtime into every page of a plugin, so `island` is a
 * global; importing this package only gives you the types (and `island` as an
 * export, for bundlers that prefer imports). See `docs/plugins/sdk.md`.
 */

/** A bit of text in the island, optionally with an icon from the package. */
export type Segment =
	| string
	| {
			text?: string;
			/** Path of an image in the package (`"icons/play.svg"`). */
			icon?: string;
			/** CSS color: `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()`. */
			color?: string;
			bold?: boolean;
			/** Monospaced digits, for timers. */
			mono?: boolean;
			/** `true` dims the text like secondary labels. */
			dim?: boolean;
	  };

/** What a module shows in the island when it isn't open, set with `island.setView`. */
export interface PluginView {
	/** Wants the compact island (a running timer, a call…). */
	active?: boolean;
	/** 0–100: higher wins the main slot, the runner-up becomes the side bubble. Default 50. */
	priority?: number;
	/** The compact pill, required to show up while `active`. */
	compact?: {
		left?: Segment | Segment[];
		right?: Segment | Segment[];
		/** Pill width in px, 180–420 (default 300). */
		width?: number;
	};
	/** A small persistent bubble on the left of the resting island (a counter…). */
	ambient?: Segment | null;
	/** Replaces the module's icon in the tab bar and side bubble. */
	icon?: string;
	/** Color of the module's tab ring (Windows Island style). */
	accent?: string;
	/** Changing it makes the island briefly open on this module ("peek"). */
	activityKey?: string;
	/** Waiting on the user: opening the island goes to this module. */
	attention?: boolean;
	/** Leave this module out of the tab bar for now. */
	hidden?: boolean;
}

export interface FetchInit {
	method?: string;
	headers?: Record<string, string> | Headers;
	/** Text, JSON-serializable value, or bytes. */
	body?: string | ArrayBuffer | ArrayBufferView | unknown;
}

export interface FetchResponse {
	status: number;
	ok: boolean;
	url: string;
	headers: Record<string, string>;
	text(): Promise<string>;
	json<T = unknown>(): Promise<T>;
	bytes(): Promise<Uint8Array>;
	arrayBuffer(): Promise<ArrayBuffer>;
}

export type Unsubscribe = () => void;

/** `delay`, `every` or both, in seconds (30 s to 7 days). `delay` defaults to `every`. */
export type AlarmOptions = { delay: number; every?: number } | { delay?: number; every: number };

export interface AlarmInfo {
	name: string;
	/** When it fires next (ms since the epoch). */
	due: number;
	/** Repeat interval in seconds, `null` for a one-off. */
	every: number | null;
}

export interface IslandSDK {
	/** SDK version the runtime implements (`"1.0"`). */
	readonly sdk: string;
	/** Resolves once the island has answered; calls made before are queued. */
	readonly ready: Promise<IslandSDK>;
	readonly plugin: { id: string; version: string };
	/** Where this page runs: the background or a module's panel. */
	readonly context: "background" | "panel";
	/** The module a panel belongs to; `null` in the background. */
	readonly module: string | null;
	/** BCP 47 code of the app's language (`"pt-BR"`). */
	readonly locale: string;
	/** A string from your `locales/<code>.json` (English when missing), `{name}` filled from `vars`. */
	t(key: string, vars?: Record<string, string | number>): string;
	onLocaleChange(callback: (locale: string) => void): Unsubscribe;

	/** Sets what `module` shows while the island is closed. */
	setView(module: string, view: PluginView | null): Promise<void>;

	/** State shared by the background and every open panel (not persisted). */
	readonly state: {
		get<T = unknown>(): T;
		set<T>(value: T): Promise<void>;
		subscribe<T = unknown>(callback: (value: T) => void): Unsubscribe;
	};

	/** The settings declared in `plugin.json`, edited in the settings window. */
	readonly settings: {
		get<T = unknown>(key: string): T;
		all(): Record<string, unknown>;
		set(key: string, value: unknown): Promise<void>;
		subscribe(callback: (values: Record<string, unknown>) => void): Unsubscribe;
	};

	/** Persistent JSON storage of the plugin's own (1 MB). */
	readonly storage: {
		get<T = unknown>(key: string): Promise<T | null>;
		set(key: string, value: unknown): Promise<void>;
		remove(key: string): Promise<void>;
		keys(): Promise<string[]>;
		clear(): Promise<void>;
	};

	/** Opens the island, on one of this plugin's modules when given. */
	expand(module?: string): Promise<void>;
	collapse(): Promise<void>;
	/** Gives the island the keyboard, for text fields in a panel. */
	focus(): Promise<void>;

	/** A shortcut from `plugin.json` was pressed (its `id`). */
	onShortcut(callback: (id: string) => void): Unsubscribe;

	/**
	 * Timers kept by the island, delivered to the background with `onAlarm`.
	 * They start a stopped background, so use them instead of `setInterval`.
	 * Needs a background script; gone when the plugin stops (re-create them
	 * when the background starts).
	 */
	readonly alarms: {
		/**
		 * Creates (or replaces) the alarm `name`: once after `delay` seconds, and
		 * then every `every` seconds when given. Both 30 s to 7 days.
		 */
		create(name: string, options: AlarmOptions): Promise<void>;
		clear(name: string): Promise<void>;
		clearAll(): Promise<void>;
		list(): Promise<AlarmInfo[]>;
	};
	/** An alarm fired (its `name`). */
	onAlarm(callback: (name: string) => void): Unsubscribe;

	/** `fetch` through the app. Needs `network:<host>`; HTTPS only; redirects are returned, not followed. */
	readonly net: { fetch(url: string | URL, init?: FetchInit): Promise<FetchResponse> };
	/** Needs `clipboard:read` / `clipboard:write`. */
	readonly clipboard: { readText(): Promise<string | null>; writeText(text: string): Promise<void> };
	/** Needs a matching `fs:read:<pattern>`; paths may start with `$HOME`, `$APPDATA`, `$LOCALAPPDATA`, `$DOCUMENTS`. */
	readonly fs: { readText(path: string): Promise<string> };
	/** Opens an https link in the default browser. Needs `open-url`. */
	openUrl(url: string): Promise<void>;

	/** Built-in providers' state. Needs `provider:<id>` (`music`, `monitor`). */
	readonly providers: {
		get<T = unknown>(id: string): Promise<T | undefined>;
		subscribe<T = unknown>(id: string, callback: (value: T | undefined) => void): Unsubscribe;
	};
}

declare global {
	interface Window {
		readonly island: IslandSDK;
	}
	const island: IslandSDK;
}

// biome-ignore lint/suspicious/noRedeclare: the module export is the same object as the global above
export declare const island: IslandSDK;
export default island;

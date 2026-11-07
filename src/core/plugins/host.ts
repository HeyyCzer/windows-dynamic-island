/**
 * The island's side of the plugin SDK (`packages/plugin-sdk/runtime/v1.js`).
 *
 * Plugin pages run in sandboxed iframes and talk to us with `postMessage`.
 * A message is trusted only for the frame it came from: `event.source` is
 * looked up in the frames registered here, so a plugin can't speak for
 * another. Privileged calls go on to the backend (`plugins/api.rs`), which
 * checks the plugin's grants again.
 */
import { useSyncExternalStore } from "react";
import { command, getProvider, onEvent, subscribeProviders } from "../bridge";
import { languageSetting, matchLocale, resolveLocale } from "../i18n";
import { getSettings, readSetting, setSetting, subscribeSettings, type Values } from "../settings";
import { pluginModuleId, pluginSettingKey } from "./store";
import type { PluginInfo, PluginSettingDef, PluginView, Segment } from "./types";

const PROTOCOL = 1;
const SDK = "1.0";

export type FrameContext = "background" | "panel";

interface Frame {
	win: Window;
	plugin: PluginInfo;
	context: FrameContext;
	module: string | null;
	/** Providers this frame subscribed to, with what it was last sent. */
	providers: Map<string, unknown>;
	ready: boolean;
}

const frames = new Map<Window, Frame>();
/** Per plugin: state shared by its frames. */
const states = new Map<string, unknown>();
/** Last settings / locale sent, per plugin, to send only changes. */
const sentSettings = new Map<string, string>();
let sentLocale = "";

/** What the island can do for a plugin; set by the island window. */
export interface IslandControls {
	expand: (moduleId?: string) => void;
	collapse: () => void;
}
let controls: IslandControls | null = null;
export const setIslandControls = (c: IslandControls | null) => {
	controls = c;
};

// Views (`island.setView`) by island module id.
let views: Record<string, PluginView> = {};
const viewListeners = new Set<() => void>();
const subscribeViews = (l: () => void) => {
	viewListeners.add(l);
	return () => void viewListeners.delete(l);
};
export const usePluginViews = () => useSyncExternalStore(subscribeViews, () => views);

function setView(moduleId: string, view: PluginView | null) {
	const next = { ...views };
	if (view) next[moduleId] = view;
	else delete next[moduleId];
	views = next;
	for (const l of viewListeners) l();
}

/** Forget what a plugin left behind (it was removed or reloaded). */
export function resetPlugin(pluginId: string) {
	states.delete(pluginId);
	sentSettings.delete(pluginId);
	const prefix = pluginModuleId(pluginId, "");
	if (Object.keys(views).some((id) => id.startsWith(prefix))) {
		views = Object.fromEntries(Object.entries(views).filter(([id]) => !id.startsWith(prefix)));
		for (const l of viewListeners) l();
	}
}

const post = (frame: Frame, message: Record<string, unknown>) =>
	frame.win.postMessage({ island: PROTOCOL, ...message }, "*");

function event(frame: Frame, name: string, data: unknown) {
	if (frame.ready) post(frame, { type: "event", name, data });
}

function framesOf(pluginId: string) {
	return [...frames.values()].filter((f) => f.plugin.id === pluginId);
}

/** A frame starts talking to us; returns the cleanup. */
export function registerFrame(
	win: Window,
	plugin: PluginInfo,
	context: FrameContext,
	module: string | null = null,
): () => void {
	start();
	frames.set(win, { win, plugin, context, module, providers: new Map(), ready: false });
	return () => {
		frames.delete(win);
	};
}

function currentLocale(values: Values = getSettings()) {
	return resolveLocale(readSetting(values, languageSetting));
}

/** The plugin's strings for `locale`, English filling the gaps. */
function messagesFor(plugin: PluginInfo, locale: string) {
	const codes = matchLocale(locale, Object.keys(plugin.messages)).reverse();
	return Object.assign({}, ...codes.map((c) => plugin.messages[c] ?? {}));
}

function settingsFor(plugin: PluginInfo, values: Values = getSettings()) {
	return Object.fromEntries(
		(plugin.manifest?.settings ?? []).map((def) => {
			const key = pluginSettingKey(plugin.id, def.key);
			return [def.key, key in values ? values[key] : def.default];
		}),
	);
}

function init(frame: Frame) {
	const locale = currentLocale();
	const settings = settingsFor(frame.plugin);
	sentSettings.set(frame.plugin.id, JSON.stringify(settings));
	frame.ready = true;
	post(frame, {
		type: "init",
		data: {
			sdk: SDK,
			plugin: { id: frame.plugin.id, version: frame.plugin.version },
			context: frame.context,
			module: frame.module,
			locale,
			messages: messagesFor(frame.plugin, locale),
			settings,
			state: states.get(frame.plugin.id) ?? null,
		},
	});
}

let started = false;
function start() {
	if (started) return;
	started = true;
	window.addEventListener("message", onMessage);
	sentLocale = currentLocale();
	subscribeSettings(onSettings);
	subscribeProviders(onProviders);
	onEvent<{ plugin: string; shortcut: string }>("plugin://shortcut", (e) => {
		for (const frame of framesOf(e.plugin)) event(frame, "shortcut", e.shortcut);
	});
}

function onMessage(e: MessageEvent) {
	const frame = frames.get(e.source as Window);
	if (!frame) return;
	const msg = e.data;
	if (!msg || typeof msg !== "object" || msg.island !== PROTOCOL) return;
	if (msg.type === "hello") {
		init(frame);
		return;
	}
	if (msg.type !== "call" || typeof msg.id !== "number" || typeof msg.method !== "string") return;
	handle(frame, msg.method, msg.params ?? {}).then(
		(value) => post(frame, { type: "result", id: msg.id, ok: true, value: value ?? null }),
		(error) =>
			post(frame, {
				type: "result",
				id: msg.id,
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			}),
	);
}

function onSettings() {
	const values = getSettings();
	const locale = currentLocale(values);
	const localeChanged = locale !== sentLocale;
	sentLocale = locale;
	for (const frame of frames.values()) {
		if (localeChanged) event(frame, "locale", { locale, messages: messagesFor(frame.plugin, locale) });
	}
	const plugins = new Map([...frames.values()].map((f) => [f.plugin.id, f.plugin]));
	for (const [id, plugin] of plugins) {
		const settings = settingsFor(plugin, values);
		const json = JSON.stringify(settings);
		if (sentSettings.get(id) === json) continue;
		sentSettings.set(id, json);
		for (const frame of framesOf(id)) event(frame, "settings", settings);
	}
}

function onProviders() {
	for (const frame of frames.values()) {
		for (const [id, last] of frame.providers) {
			const value = getProvider(id);
			if (value === last) continue;
			frame.providers.set(id, value);
			event(frame, `provider:${id}`, value);
		}
	}
}

const has = (frame: Frame, permission: string) => frame.plugin.granted.includes(permission);

function need(frame: Frame, permission: string) {
	if (!has(frame, permission)) throw new Error(`permission '${permission}' wasn't granted`);
}

function ownModule(frame: Frame, module: unknown): string {
	if (typeof module !== "string" || !frame.plugin.manifest?.modules.some((m) => m.id === module)) {
		throw new Error(`'${String(module)}' isn't a module of this plugin`);
	}
	return pluginModuleId(frame.plugin.id, module);
}

type Params = Record<string, unknown>;

async function handle(frame: Frame, method: string, p: Params): Promise<unknown> {
	const plugin = frame.plugin.id;
	switch (method) {
		case "view.set":
			setView(ownModule(frame, p.module), p.view ? sanitizeView(p.view) : null);
			return;
		case "state.set": {
			if (JSON.stringify(p.value ?? null).length > 256 * 1024) throw new Error("state is too big (256 KB)");
			states.set(plugin, p.value);
			for (const other of framesOf(plugin)) if (other !== frame) event(other, "state", p.value);
			return;
		}
		case "settings.set": {
			const def = frame.plugin.manifest?.settings.find((s) => s.key === p.key);
			if (!def) throw new Error(`unknown setting '${String(p.key)}'`);
			setSetting(pluginSettingKey(plugin, def.key), checkSetting(def, p.value));
			return;
		}
		case "storage":
			return command("plugin_storage", { plugin, op: p.op, key: p.key ?? null, value: p.value ?? null });
		case "island.expand":
			controls?.expand(p.module ? ownModule(frame, p.module) : undefined);
			return;
		case "island.collapse":
			controls?.collapse();
			return;
		case "island.focus":
			// Only while the user is looking at the panel: a background can't steal the keyboard.
			if (frame.context !== "panel") throw new Error("focus is only for panels");
			return command("focus_island");
		case "net.fetch":
			return command("plugin_fetch", { plugin, request: p });
		case "clipboard.read":
			need(frame, "clipboard:read");
			return command("plugin_clipboard", { plugin, text: null });
		case "clipboard.write":
			need(frame, "clipboard:write");
			return command("plugin_clipboard", { plugin, text: String(p.text ?? "") });
		case "fs.readText":
			return command("plugin_read_file", { plugin, path: String(p.path ?? "") });
		case "openUrl":
			need(frame, "open-url");
			return command("plugin_open_url", { plugin, url: String(p.url ?? "") });
		case "providers.get":
			need(frame, `provider:${String(p.id)}`);
			return getProvider(String(p.id));
		case "providers.subscribe": {
			const id = String(p.id);
			need(frame, `provider:${id}`);
			const value = getProvider(id);
			frame.providers.set(id, value);
			event(frame, `provider:${id}`, value);
			return;
		}
		default:
			throw new Error(`unknown method '${method}'`);
	}
}

function checkSetting(def: PluginSettingDef, value: unknown): unknown {
	const fail = () => {
		throw new Error(`'${def.key}' doesn't take ${JSON.stringify(value)}`);
	};
	switch (def.type) {
		case "boolean":
			if (typeof value !== "boolean") fail();
			break;
		case "number":
			if (
				typeof value !== "number" ||
				!Number.isFinite(value) ||
				(def.min !== undefined && value < def.min) ||
				(def.max !== undefined && value > def.max)
			)
				fail();
			break;
		case "string":
			if (typeof value !== "string" || value.length > 4000) fail();
			break;
		case "select":
			if (!def.options?.some((o) => o.value === value)) fail();
			break;
	}
	return value;
}

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*){2,3}\))$/i;
const color = (c: unknown) => (typeof c === "string" && COLOR.test(c.trim()) ? c.trim() : undefined);
const short = (s: unknown, max = 80) => (typeof s === "string" ? s.slice(0, max) : undefined);
const clamp = (n: unknown, min: number, max: number, fallback: number) =>
	typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;

function sanitizeSegment(s: unknown): Segment | null {
	if (typeof s === "string") return s.slice(0, 80);
	if (!s || typeof s !== "object") return null;
	const o = s as Record<string, unknown>;
	return {
		text: short(o.text),
		icon: short(o.icon, 200),
		color: color(o.color),
		bold: o.bold === true,
		mono: o.mono === true,
		dim: o.dim === true,
	};
}

function sanitizeSegments(s: unknown): Segment[] {
	const list = Array.isArray(s) ? s : s === undefined || s === null ? [] : [s];
	return list
		.slice(0, 4)
		.map(sanitizeSegment)
		.filter((x): x is Segment => x !== null);
}

/** Only what the island knows how to draw, within bounds. */
function sanitizeView(raw: unknown): PluginView {
	const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
	const compact = v.compact && typeof v.compact === "object" ? (v.compact as Record<string, unknown>) : null;
	return {
		active: v.active === true,
		priority: clamp(v.priority, 0, 100, 50),
		compact: compact
			? {
					left: sanitizeSegments(compact.left),
					right: sanitizeSegments(compact.right),
					width: clamp(compact.width, 180, 420, 300),
				}
			: undefined,
		ambient: v.ambient === undefined || v.ambient === null ? null : sanitizeSegment(v.ambient),
		icon: short(v.icon, 200),
		accent: color(v.accent),
		activityKey: short(v.activityKey, 120),
		attention: v.attention === true,
		hidden: v.hidden === true,
	};
}

/**
 * Plugins in the browser preview: the example plugins (`examples/plugins/`),
 * served by `vite-plugin-island-plugins.ts`, stand in for installed ones, and
 * the backend's plugin commands are answered here.
 */
import { emitLocal } from "../../core/bridge";
import { getPlugins, PLUGINS_CHANGED, setPlugins } from "../../core/plugins/store";
import type { CatalogSource, PluginInfo, PluginSource } from "../../core/plugins/types";
import { defineMock } from "./kit";

async function load() {
	try {
		const list: PluginInfo[] = await (await fetch("/__plugins/__list.json")).json();
		setPlugins(list);
	} catch (e) {
		console.warn("[plugins mock]", e);
	}
}

export function startPluginsMock() {
	void load();
}

const STORAGE = "island-plugin-storage";
const readStorage = (): Record<string, Record<string, unknown>> => {
	try {
		return JSON.parse(localStorage.getItem(STORAGE) ?? "{}");
	} catch {
		return {};
	}
};

const examples: PluginSource = {
	id: "examples",
	label: "examples/plugins",
	indexUrl: "/__plugins/__index.json",
};
let sources: PluginSource[] = [examples];

type Args = Record<string, unknown>;
const granted = (plugin: unknown, permission: string) =>
	getPlugins()
		.find((p) => p.id === plugin)
		?.granted.includes(permission);

export const pluginsMock = defineMock({
	label: "Plugins",
	controls: [
		{ kind: "button", label: "Reload plugins", run: () => void load() },
		...[
			["pomodoro", "toggle"],
			["pomodoro", "reset"],
			["counter", "increment"],
		].map(([plugin, shortcut]) => ({
			kind: "button" as const,
			label: `Shortcut: ${plugin} ${shortcut}`,
			run: () => emitLocal("plugin://shortcut", { plugin, shortcut }),
		})),
	],
	commands: {
		plugins_list: () => getPlugins(),
		plugins_reload: async () => {
			await load();
			emitLocal(PLUGINS_CHANGED, null);
		},
		plugin_sources: () => sources,
		plugin_source_add: (args) => {
			const input = String((args as Args).input);
			const source = { id: `github:${input}`, label: input, indexUrl: "" };
			sources = [...sources, source];
			return source;
		},
		plugin_source_remove: (args) => {
			sources = sources.filter((s) => s.id !== (args as Args).id);
		},
		plugin_catalog: async (): Promise<CatalogSource[]> =>
			Promise.all(
				sources.map(async (source) => {
					if (!source.indexUrl)
						return { source, name: null, plugins: [], error: "can't reach this source in the preview" };
					const index = await (await fetch(source.indexUrl)).json();
					return {
						source,
						name: index.name ?? null,
						plugins: index.plugins.map((p: { id: string; icon?: string }) => ({
							...p,
							// `plugins/<name>/[dist/]icon.svg` in the repo; the dev server serves the
							// package (the folder, or `dist/` of a bundled one) by plugin id.
							icon:
								p.icon &&
								`/__plugins/${p.id}/${p.icon
									.split("/")
									.slice(2)
									.join("/")
									.replace(/^dist\//, "")}`,
							compatible: true,
							// Like the backend: only a plugin installed from this source counts, not dev folders.
							installed: null,
							update: false,
						})),
						error: null,
					};
				}),
			),
		plugin_install: (args) => getPlugins().find((p) => p.id === (args as Args).id),
		plugin_uninstall: () => undefined,
		plugin_load_dev: () => {
			throw new Error("not in the preview");
		},
		plugin_pick_dev_folder: () => null,
		plugin_storage: (args) => {
			const { plugin, op, key, value } = args as Args;
			const all = readStorage();
			all[String(plugin)] ??= {};
			const data = all[String(plugin)];
			let result: unknown = null;
			if (op === "get") result = data[String(key)] ?? null;
			else if (op === "keys") result = Object.keys(data);
			else if (op === "set") data[String(key)] = value;
			else if (op === "remove") delete data[String(key)];
			else if (op === "clear") all[String(plugin)] = {};
			localStorage.setItem(STORAGE, JSON.stringify(all));
			return result;
		},
		plugin_fetch: async (args) => {
			const { plugin, request } = args as { plugin: string; request: { url: string; method?: string } };
			const host = new URL(request.url).host;
			if (!granted(plugin, `network:${host}`)) throw new Error(`permission 'network:${host}' wasn't granted`);
			const res = await fetch(request.url, { method: request.method });
			const bytes = new Uint8Array(await res.arrayBuffer());
			let binary = "";
			for (const b of bytes) binary += String.fromCharCode(b);
			return { status: res.status, url: res.url, headers: {}, body: btoa(binary) };
		},
		plugin_open_url: (args) => void window.open(String((args as Args).url), "_blank"),
		plugin_clipboard: async (args) => {
			const { text } = args as Args;
			if (typeof text === "string") await navigator.clipboard.writeText(text);
			else return navigator.clipboard.readText();
		},
		plugin_read_file: () => {
			throw new Error("no files in the preview");
		},
	},
});

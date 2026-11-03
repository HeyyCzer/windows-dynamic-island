import { type ComponentType, useEffect } from "react";
import { Button } from "../../components/ui/button";
import { command, isTauri } from "../bridge";
import { createStore } from "../island";
import { ensurePluginSDK } from "./sdk";
import type { InstalledPlugin, LoadedPluginPackage } from "./types";

export interface Diagnostic {
	status: "success" | "error" | "info";
	message: string;
	details?: string;
}
export interface PluginModule {
	Panel: ComponentType<{ settings: Record<string, unknown> }>;
	Background?: ComponentType<{ settings: Record<string, unknown> }>;
	diagnose?: (settings: Record<string, unknown>) => Promise<Diagnostic>;
	dispose?: () => void;
}
interface RuntimeState {
	key: string;
	module?: PluginModule;
	error?: string;
}
const runtime = createStore<Record<string, RuntimeState>>({});
const pending = new Map<string, Promise<PluginModule>>();
const registrations = new Map<string, PluginModule>();
const resources = new Map<string, { script: HTMLScriptElement; css: string }>();
const styles = new Map<string, { element: HTMLStyleElement; users: number }>();
const generations = new Map<string, number>();

export function registerPlugin(id: string, version: string, module: PluginModule) {
	if (!module || typeof module.Panel !== "function") throw Error("插件没有导出有效的界面");
	registrations.set(`${id}@${version}`, module);
}
export function unloadPlugin(id: string) {
	generations.set(id, (generations.get(id) || 0) + 1);
	const state = runtime.get()[id];
	try {
		state?.module?.dispose?.();
	} catch (err) {
		console.error("Plugin cleanup failed", id, err);
	}
	if (state) {
		registrations.delete(`${id}@${state.key.split(":")[0]}`);
	}
	const resource = resources.get(id);
	if (resource) {
		resource.script.remove();
		const shared = styles.get(resource.css);
		if (shared && --shared.users === 0) {
			shared.element.remove();
			styles.delete(resource.css);
		}
		resources.delete(id);
	}
	runtime.set((s) => {
		const next = { ...s };
		delete next[id];
		return next;
	});
}
async function readPackage(plugin: InstalledPlugin): Promise<LoadedPluginPackage> {
	if (isTauri) return command<LoadedPluginPackage>("plugin_load", { id: plugin.manifest.id });
	const content = localStorage.getItem(`island_plugin_package_${plugin.manifest.id}`);
	if (!content) throw Error("插件文件尚未下载");
	return JSON.parse(content) as LoadedPluginPackage;
}
export function loadPlugin(plugin: InstalledPlugin): Promise<PluginModule> {
	const { id, version } = plugin.manifest;
	const key = `${version}:${plugin.packageSha256 || "missing"}`;
	const existing = runtime.get()[id];
	if (existing?.key === key && existing.module) return Promise.resolve(existing.module);
	const requestKey = `${id}:${key}`;
	const flight = pending.get(requestKey);
	if (flight) return flight;
	if (!plugin.packageSha256) return Promise.reject(Error("此插件需要下载独立插件包，现有配置已保留"));
	if (runtime.get()[id]) unloadPlugin(id);
	const generation = generations.get(id) || 0;
	const load = (async () => {
		const loaded = await readPackage(plugin);
		if ((generations.get(id) || 0) !== generation) throw Error("插件已停用或卸载");
		if (loaded.manifest.id !== id || loaded.manifest.version !== version || loaded.sha256 !== plugin.packageSha256)
			throw Error("插件文件与安装记录不一致，请重新安装");
		ensurePluginSDK();
		runtime.set((s) => ({ ...s, [id]: { key } }));
		let style = styles.get(loaded.css);
		if (!style) {
			const element = document.createElement("style");
			element.dataset.pluginStyle = "shared";
			element.textContent = loaded.css;
			document.head.append(element);
			style = { element, users: 0 };
			styles.set(loaded.css, style);
		}
		style.users++;
		const script = document.createElement("script");
		const url = URL.createObjectURL(new Blob([loaded.code], { type: "text/javascript" }));
		script.src = url;
		script.dataset.plugin = id;
		resources.set(id, { script, css: loaded.css });
		try {
			await new Promise<void>((resolve, reject) => {
				const timer = setTimeout(() => reject(Error("插件加载超时")), 10000);
				script.onload = () => {
					clearTimeout(timer);
					resolve();
				};
				script.onerror = () => {
					clearTimeout(timer);
					reject(Error("插件脚本加载失败"));
				};
				document.head.append(script);
			});
			const module = registrations.get(`${id}@${version}`);
			if (!module) throw Error("插件没有注册入口");
			if ((generations.get(id) || 0) !== generation || runtime.get()[id]?.key !== key)
				throw Error("插件版本在加载期间已变更");
			runtime.set((s) => ({ ...s, [id]: { key, module } }));
			return module;
		} finally {
			URL.revokeObjectURL(url);
		}
	})()
		.catch((err: unknown) => {
			const message = err instanceof Error ? err.message : String(err);
			if ((generations.get(id) || 0) === generation) {
				const resource = resources.get(id);
				if (resource) {
					resource.script.remove();
					const shared = styles.get(resource.css);
					if (shared && --shared.users === 0) {
						shared.element.remove();
						styles.delete(resource.css);
					}
					resources.delete(id);
				}
				registrations.delete(`${id}@${version}`);
				runtime.set((s) => ({ ...s, [id]: { key, error: message } }));
			}
			throw err;
		})
		.finally(() => {
			if (pending.get(requestKey) === load) pending.delete(requestKey);
		});
	pending.set(requestKey, load);
	return load;
}

function useRuntime(plugin: InstalledPlugin) {
	const state = runtime.use()[plugin.manifest.id];
	useEffect(() => {
		if (plugin.packageSha256) void loadPlugin(plugin).catch(() => {});
	}, [plugin]);
	return state;
}
export function ExternalPluginPanel({ plugin }: { plugin: InstalledPlugin }) {
	const state = useRuntime(plugin);
	const Panel = state?.module?.Panel;
	if (Panel) return <Panel key={state.key} settings={plugin.customSettings} />;
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
			<p className="text-[13px] text-text-dim">
				{state?.error || (!plugin.packageSha256 ? "需要下载独立插件文件，已有配置将保留。" : "正在加载已安装的插件…")}
			</p>
			<Button
				onClick={() => {
					localStorage.setItem("settings_navigate", `/plugins/${plugin.manifest.id}`);
					void command("open_settings");
				}}
			>
				管理插件
			</Button>
		</div>
	);
}
function Background({ plugin }: { plugin: InstalledPlugin }) {
	const state = useRuntime(plugin);
	const Owner = state?.module?.Background;
	return Owner ? <Owner key={state.key} settings={plugin.customSettings} /> : null;
}
export function PluginBackgrounds({ plugins }: { plugins: InstalledPlugin[] }) {
	useEffect(() => {
		for (const id of Object.keys(runtime.get()))
			if (!plugins.some((p) => p.enabled && p.manifest.id === id)) unloadPlugin(id);
	}, [plugins]);
	return (
		<>
			{plugins
				.filter((p) => p.enabled)
				.map((p) => (
					<Background key={p.manifest.id} plugin={p} />
				))}
		</>
	);
}
export async function diagnosePlugin(plugin: InstalledPlugin, settings: Record<string, unknown>) {
	const module = await loadPlugin(plugin);
	return module.diagnose ? module.diagnose(settings) : { status: "info" as const, message: "此插件未提供连通性诊断。" };
}

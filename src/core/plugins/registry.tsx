import { emit, listen } from "@tauri-apps/api/event";
import {
	CloudSunIcon,
	CoffeeIcon,
	CompassIcon,
	Gamepad2Icon,
	MessageSquareIcon,
	PuzzleIcon,
	SearchIcon,
	ShieldCheckIcon,
	SparklesIcon,
	StickyNoteIcon,
	TimerIcon,
	TrendingUpIcon,
} from "lucide-react";
import { type ReactNode, useSyncExternalStore } from "react";
import navopathLogo from "../../assets/navopath.png";
import { ObsidianIconSvg } from "../../assets/ObsidianIcon";
import { command, isTauri } from "../bridge";
import { type MessageKey, type Translate, useT } from "../i18n";
import type { IslandModule, ModuleEntry } from "../types";
import { pluginActivities } from "./activity";
import { ExternalPluginPanel, unloadPlugin } from "./runtime";
import type { InstalledPlugin, LoadedPluginPackage, PluginManifest, PluginPackage } from "./types";

const STORAGE_KEY = "island_installed_plugins";
export function renderPluginIcon(iconName: string, size = 14, color?: string): ReactNode {
	const props = { size, ...(color ? { color } : {}) };
	const icons = {
		Timer: TimerIcon,
		CloudSun: CloudSunIcon,
		Coffee: CoffeeIcon,
		StickyNote: StickyNoteIcon,
		TrendingUp: TrendingUpIcon,
		Gamepad2: Gamepad2Icon,
		MessageSquare: MessageSquareIcon,
		Search: SearchIcon,
		ShieldCheck: ShieldCheckIcon,
		Compass: CompassIcon,
		Sparkles: SparklesIcon,
	};
	if (iconName === "Obsidian") return <ObsidianIconSvg size={size} className={color ? "" : "text-purple-400"} />;
	if (iconName === "NavoPath")
		return (
			<img
				src={navopathLogo}
				alt="NavoPath"
				style={{ width: size, height: size }}
				className="shrink-0 object-contain"
			/>
		);
	const Icon = icons[iconName as keyof typeof icons] || PuzzleIcon;
	return <Icon {...props} />;
}
function initial(): InstalledPlugin[] {
	try {
		const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
		return Array.isArray(value) ? value.filter((p) => p?.manifest?.id) : [];
	} catch {
		return [];
	}
}
let installedPlugins = initial();
const listeners = new Set<() => void>();
function notify() {
	for (const listener of listeners) listener();
}
function accept(value: unknown) {
	if (Array.isArray(value)) {
		installedPlugins = value as InstalledPlugin[];
		localStorage.setItem(STORAGE_KEY, JSON.stringify(installedPlugins));
		notify();
	}
}
function save() {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(installedPlugins));
	notify();
	if (isTauri) {
		void command("set_setting", { key: "plugins.installed", value: installedPlugins }).catch((err) =>
			console.error("Plugin settings could not be saved", err),
		);
		void emit("plugins://changed", installedPlugins);
	}
}
if (typeof window !== "undefined") {
	window.addEventListener("storage", (event) => {
		if (event.key === STORAGE_KEY && event.newValue) {
			try {
				accept(JSON.parse(event.newValue));
			} catch {
				/* Ignore malformed cross-window data. */
			}
		}
	});
	if (isTauri) {
		void listen<InstalledPlugin[]>("plugins://changed", (event) => accept(event.payload));
		void listen<Record<string, unknown>>("settings://changed", (event) => accept(event.payload?.["plugins.installed"]));
		void command<Record<string, unknown>>("get_settings")
			.then((s) => accept(s?.["plugins.installed"]))
			.catch(() => {});
	}
}
export function getInstalledPlugins() {
	return installedPlugins;
}
export function useInstalledPlugins() {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => installedPlugins,
	);
}

async function hash(content: string) {
	return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)))]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
export function inspectPluginPackage(content: string): PluginPackage {
	if (content.length > 8 * 1024 * 1024) throw Error("插件包超过大小限制");
	const pkg = JSON.parse(content) as PluginPackage;
	if (
		pkg.formatVersion !== 1 ||
		pkg.manifest?.sdkVersion !== 1 ||
		!pkg.manifest?.id ||
		!pkg.manifest?.version ||
		!pkg.code
	)
		throw Error("需要包含可执行代码的 .island-plugin.json 插件包，仅有清单不能安装");
	return pkg;
}
function retainSettings(loaded: LoadedPluginPackage, source: InstalledPlugin["source"]) {
	const old = installedPlugins.find((p) => p.manifest.id === loaded.manifest.id);
	const defaults = Object.fromEntries((loaded.manifest.settings || []).map((s) => [s.key, s.default]));
	const next: InstalledPlugin = {
		manifest: loaded.manifest,
		installedAt: old?.installedAt || Date.now(),
		enabled: old?.enabled ?? true,
		customSettings: { ...defaults, ...old?.customSettings },
		source,
		packageSha256: loaded.sha256,
	};
	unloadPlugin(next.manifest.id);
	installedPlugins = [...installedPlugins.filter((p) => p.manifest.id !== next.manifest.id), next];
	save();
	return next;
}
export async function installPlugin(manifest: PluginManifest, source: InstalledPlugin["source"] = "marketplace") {
	if (!manifest.packageUrl || !manifest.sha256) throw Error("插件目录中没有独立安装包，请刷新市场");
	if (
		!window.confirm(
			`即将下载并运行“${manifest.name}”插件。插件代码会在灵动岛窗口中执行，可使用该窗口已有的系统接口与数据。请只安装你信任的发布者。继续吗？`,
		)
	)
		throw Error("已取消安装");
	let loaded: LoadedPluginPackage;
	if (isTauri) loaded = await command<LoadedPluginPackage>("plugin_download", { descriptor: manifest });
	else {
		const response = await fetch(manifest.packageUrl, { signal: AbortSignal.timeout(30000) });
		if (!response.ok) throw Error(`插件下载 HTTP ${response.status}`);
		const content = await response.text();
		const pkg = inspectPluginPackage(content);
		const sha256 = await hash(content);
		if (sha256 !== manifest.sha256 || pkg.manifest.id !== manifest.id || pkg.manifest.version !== manifest.version)
			throw Error("插件包校验失败，原版本未更改");
		loaded = { ...pkg, sha256 };
		localStorage.setItem(`island_plugin_package_${manifest.id}`, JSON.stringify(loaded));
	}
	return retainSettings(loaded, source);
}
export async function installLocalPlugin(content: string) {
	const pkg = inspectPluginPackage(content);
	if (
		!window.confirm(
			`即将运行本地插件“${pkg.manifest.name}”。插件代码会在灵动岛窗口中执行，可使用该窗口已有的系统接口与数据。请只安装你信任的代码。继续吗？`,
		)
	)
		throw Error("已取消安装");
	const loaded = isTauri
		? await command<LoadedPluginPackage>("plugin_import", { content })
		: { ...pkg, sha256: await hash(content) };
	if (!isTauri) localStorage.setItem(`island_plugin_package_${pkg.manifest.id}`, JSON.stringify(loaded));
	return retainSettings(loaded, "local");
}
export async function uninstallPlugin(id: string) {
	if (isTauri) await command("plugin_remove", { id });
	else localStorage.removeItem(`island_plugin_package_${id}`);
	unloadPlugin(id);
	installedPlugins = installedPlugins.filter((p) => p.manifest.id !== id);
	save();
}
export function togglePlugin(id: string, enabled?: boolean) {
	installedPlugins = installedPlugins.map((p) => (p.manifest.id === id ? { ...p, enabled: enabled ?? !p.enabled } : p));
	save();
}
export function updatePluginSettings(id: string, settings: Record<string, unknown>) {
	installedPlugins = installedPlugins.map((p) =>
		p.manifest.id === id ? { ...p, customSettings: { ...p.customSettings, ...settings } } : p,
	);
	save();
}

export function createPluginModuleEntry(plugin: InstalledPlugin, t: Translate): ModuleEntry {
	const { manifest } = plugin;
	const activity = pluginActivities.get()[manifest.id];
	const title = manifest.titleKey ? t(manifest.titleKey) : manifest.name;
	const view = {
		active: Boolean(plugin.packageSha256 && activity?.active),
		priority: Math.max(0, Math.min(100, activity?.priority ?? 10)),
		icon: renderPluginIcon(manifest.icon, 14, manifest.accentColor),
		accent: activity?.accent || manifest.accentColor || "#a9a49b",
		compact: {
			left: (
				<span className="flex min-w-0 items-center gap-2 text-xs">
					{renderPluginIcon(manifest.icon, 14)}
					<span className="max-w-44 truncate">{activity?.left || title}</span>
				</span>
			),
			right: (
				<span className="text-[11px] text-text-dim tabular-nums">
					{activity?.right || (!plugin.packageSha256 ? "待下载" : "已启用")}
				</span>
			),
			width: 280,
		},
		expanded: <ExternalPluginPanel plugin={plugin} />,
		expandedSize: manifest.expandedSize || { width: 580, height: 210 },
	};
	const module: IslandModule = {
		id: manifest.id,
		title: (manifest.titleKey || manifest.name) as MessageKey,
		settingsIcon: renderPluginIcon(manifest.icon, 14),
		enabledByDefault: true,
		useView: () => view,
	};
	return { module, view };
}
export function usePluginModuleEntries() {
	const plugins = useInstalledPlugins();
	pluginActivities.use();
	const t = useT();
	return plugins.filter((p) => p.enabled).map((p) => createPluginModuleEntry(p, t));
}
export function createPluginModule(plugin: InstalledPlugin): IslandModule {
	return {
		id: plugin.manifest.id,
		title: (plugin.manifest.titleKey || plugin.manifest.name) as MessageKey,
		useView() {
			return createPluginModuleEntry(plugin, useT()).view;
		},
	};
}

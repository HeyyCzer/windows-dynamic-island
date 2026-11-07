/**
 * Plugins' modules as ordinary island modules: same tabs, settings page,
 * placement, ordering and "open" shortcut as the built-in ones. Only their
 * view comes from elsewhere: what the plugin last set with `island.setView`,
 * plus its panel page in a sandboxed frame.
 */
import { useMemo } from "react";
import { PluginFrame } from "../../components/plugins/PluginFrame";
import { PluginIcon, Segments } from "../../components/plugins/Segments";
import { modules as builtinModules } from "../../modules";
import { useT } from "../i18n";
import { useSettings } from "../settings";
import type { IslandModule, ModuleEntry, ModuleView } from "../types";
import { usePluginViews } from "./host";
import { isRunnable, pluginKey, pluginModuleId, pluginUrl, usePluginGeneration, usePlugins } from "./store";
import type { PluginInfo, PluginModuleDef, PluginView } from "./types";

/** Never called: the controller takes plugin views from `usePluginEntries`. */
const noView = (): ModuleView => {
	throw new Error("plugin modules have no useView");
};

function toModule(plugin: PluginInfo, def: PluginModuleDef): IslandModule {
	return {
		id: pluginModuleId(plugin.id, def.id),
		title: pluginKey(plugin.id, def.title),
		settingsIcon: <PluginIcon pluginId={plugin.id} path={def.icon ?? plugin.manifest?.icon} />,
		enabledByDefault: def.enabledByDefault,
		useView: noView,
		plugin: { plugin, def },
	};
}

/** Modules of the plugins that loaded and are switched on. */
export function usePluginModules(): IslandModule[] {
	const plugins = usePlugins();
	const values = useSettings();
	const runnable = plugins.filter((p) => isRunnable(p, values));
	const signature = runnable.map((p) => `${p.id}@${p.version}:${p.installedAt}`).join(",");
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on a signature so unrelated settings changes keep the list
	return useMemo(
		() => runnable.flatMap((p) => (p.manifest?.modules ?? []).map((def) => toModule(p, def))),
		[signature],
	);
}

/** Built-in modules followed by the plugins' ones (settings pages). */
export function useAllModules(): IslandModule[] {
	const plugin = usePluginModules();
	return useMemo(() => [...builtinModules, ...plugin], [plugin]);
}

/** Each plugin module with the view its plugin set. */
export function usePluginEntries(modules: IslandModule[]): ModuleEntry[] {
	const views = usePluginViews();
	const generation = usePluginGeneration();
	const t = useT();
	return useMemo(
		() =>
			modules.flatMap((module) =>
				module.plugin ? [{ module, view: toView(module, views[module.id], t(module.title), generation) }] : [],
			),
		[modules, views, t, generation],
	);
}

function toView(module: IslandModule, view: PluginView | undefined, title: string, generation: number): ModuleView {
	const { plugin, def } = module.plugin as NonNullable<IslandModule["plugin"]>;
	const icon = <PluginIcon pluginId={plugin.id} path={view?.icon ?? def.icon ?? plugin.manifest?.icon} />;
	const compact = view?.compact;
	// Developer mode reloads the panel on every refresh, so a rebuild shows up.
	const reload = plugin.dev ? `?v=${generation}` : "";
	return {
		active: !!view?.active && !!compact,
		priority: view?.priority ?? 50,
		icon,
		compact: compact
			? {
					left: <Segments pluginId={plugin.id} segments={compact.left} />,
					right: <Segments pluginId={plugin.id} segments={compact.right} />,
					width: compact.width,
				}
			: undefined,
		ambient: view?.ambient ? (
			<span className="flex items-center text-[12px] font-bold">
				<Segments pluginId={plugin.id} segments={view.ambient} />
			</span>
		) : undefined,
		expanded: def.panel ? (
			<PluginFrame
				key={`${plugin.id}@${plugin.version}:${plugin.installedAt}${reload}`}
				plugin={plugin}
				context="panel"
				module={def.id}
				src={`${pluginUrl(plugin.id, def.panel)}${reload}`}
				title={title}
				className="h-full w-full"
			/>
		) : (
			<div className="grid h-full place-items-center text-[13px] text-text-dim">{title}</div>
		),
		expandedSize: def.size,
		accent: view?.accent,
		activityKey: view?.activityKey,
		attention: view?.attention,
		hidden: view?.hidden,
	};
}

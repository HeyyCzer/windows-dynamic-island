import { createPluginModule, getInstalledPlugins, useInstalledPlugins } from "../core/plugins/registry";
import type { IslandModule } from "../core/types";
import { activitiesModule } from "./activities";
import { aiAgentsModule } from "./ai-agents";
import { askModule } from "./ask";
import { clipboardModule } from "./clipboard";
import { clockModule } from "./clock";
import { findModule } from "./find";
import { githubModule } from "./github";
import { hydrationModule } from "./hydration";
import { monitorModule } from "./monitor";
import { musicModule } from "./music";
import { notificationsModule } from "./notifications";
import { shelfModule } from "./shelf";

/**
 * Built-in core modules.
 */
export const builtinModules: IslandModule[] = [
	musicModule,
	aiAgentsModule,
	askModule,
	findModule,
	notificationsModule,
	activitiesModule,
	shelfModule,
	clipboardModule,
	githubModule,
	hydrationModule,
	monitorModule,
	clockModule,
];

/**
 * Returns all built-in modules plus all enabled installed plugins.
 */
export function getAllModules(): IslandModule[] {
	const pluginModules = getInstalledPlugins()
		.filter((p) => p.enabled)
		.map(createPluginModule);
	return [...builtinModules, ...pluginModules];
}

/**
 * React hook that returns all modules and automatically re-renders
 * whenever a plugin is installed, enabled, or uninstalled.
 */
export function useAllModules(): IslandModule[] {
	const plugins = useInstalledPlugins();
	const pluginModules = plugins.filter((p) => p.enabled).map(createPluginModule);
	return [...builtinModules, ...pluginModules];
}

export const modules: IslandModule[] = getAllModules();

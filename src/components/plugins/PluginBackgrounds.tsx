import { useEffect, useMemo } from "react";
import { useT } from "../../core/i18n";
import { syncPlugins, useAwakeBackgrounds } from "../../core/plugins/host";
import { isRunnable, pluginKey, pluginUrl, usePluginGeneration, usePlugins } from "../../core/plugins/store";
import { useSettings } from "../../core/settings";
import { PluginFrame } from "./PluginFrame";

/**
 * The background pages of the plugins, out of sight in the island window:
 * persistent ones all the time, the others while the host has woken them up
 * (`core/plugins/host.ts`).
 */
export function PluginBackgrounds() {
	const plugins = usePlugins();
	const values = useSettings();
	const generation = usePluginGeneration();
	const awake = useAwakeBackgrounds();
	const t = useT();

	const runnable = useMemo(
		() =>
			plugins
				.filter((p) => isRunnable(p, values))
				.map((plugin) => {
					// Developer mode restarts on every refresh, so a rebuild shows up.
					const reload = plugin.dev ? `?v=${generation}` : "";
					return { key: `${plugin.id}@${plugin.version}:${plugin.installedAt}${reload}`, reload, plugin };
				}),
		[plugins, values, generation],
	);
	useEffect(() => syncPlugins(runnable), [runnable]);

	return (
		<div aria-hidden className="pointer-events-none fixed top-0 left-0 size-0 overflow-hidden opacity-0">
			{runnable
				.filter(({ plugin: p }) => p.manifest?.background && (p.manifest.persistent || awake.has(p.id)))
				.map(({ key, reload, plugin: p }) => (
					<PluginFrame
						key={key}
						plugin={p}
						context="background"
						src={`${pluginUrl(p.id, "__background.html")}${reload}`}
						title={t(pluginKey(p.id, p.manifest?.name ?? p.id))}
					/>
				))}
		</div>
	);
}

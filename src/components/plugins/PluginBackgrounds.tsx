import { useT } from "../../core/i18n";
import { isRunnable, pluginKey, pluginUrl, usePluginGeneration, usePlugins } from "../../core/plugins/store";
import { useSettings } from "../../core/settings";
import { PluginFrame } from "./PluginFrame";

/** The background page of every plugin that has one, out of sight in the island window. */
export function PluginBackgrounds() {
	const plugins = usePlugins();
	const values = useSettings();
	const generation = usePluginGeneration();
	const t = useT();
	return (
		<div aria-hidden className="pointer-events-none fixed top-0 left-0 size-0 overflow-hidden opacity-0">
			{plugins
				.filter((p) => isRunnable(p, values) && p.manifest?.background)
				.map((p) => {
					// Developer mode restarts on every refresh, so a rebuild shows up.
					const reload = p.dev ? `?v=${generation}` : "";
					return (
						<PluginFrame
							key={`${p.id}@${p.version}:${p.installedAt}${reload}`}
							plugin={p}
							context="background"
							src={`${pluginUrl(p.id, "__background.html")}${reload}`}
							title={t(pluginKey(p.id, p.manifest?.name ?? p.id))}
						/>
					);
				})}
		</div>
	);
}

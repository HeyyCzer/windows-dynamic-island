import { PluginIcon } from "../../components/plugins/Segments";
import { Card } from "../../components/ui/card";
import { useT } from "../../core/i18n";
import { useAllModules } from "../../core/plugins/modules";
import { isRunnable, pluginKey, pluginShortcutId, usePlugins } from "../../core/plugins/store";
import { moduleShortcutId } from "../../core/shortcuts";
import { Lead, Title } from "../components/Heading";
import { ShortcutRow } from "../components/ShortcutRow";

/** Every module's global shortcut in one list (each module's page has its own too). */
export function ShortcutsPage({ values }: { values: Record<string, unknown> }) {
	const t = useT();
	const modules = useAllModules();
	const plugins = usePlugins().filter((p) => isRunnable(p, values));
	return (
		<>
			<Title>{t("shortcuts.title")}</Title>
			<Lead>{t("shortcuts.desc")}</Lead>
			<Card>
				{modules.map((module) => (
					<ShortcutRow
						key={module.id}
						id={moduleShortcutId(module)}
						values={values}
						label={t(module.title)}
						icon={module.settingsIcon}
						hint={false}
					/>
				))}
				{plugins.flatMap((plugin) =>
					(plugin.manifest?.shortcuts ?? []).map((s) => (
						<ShortcutRow
							key={pluginShortcutId(plugin.id, s.id)}
							id={pluginShortcutId(plugin.id, s.id)}
							values={values}
							label={`${t(pluginKey(plugin.id, plugin.manifest?.name ?? plugin.id))}: ${t(pluginKey(plugin.id, s.label))}`}
							icon={<PluginIcon pluginId={plugin.id} path={plugin.manifest?.icon} />}
							hint={false}
						/>
					)),
				)}
			</Card>
		</>
	);
}

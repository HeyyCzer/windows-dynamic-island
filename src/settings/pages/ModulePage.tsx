import { motion } from "motion/react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Button } from "../../components/ui/button";
import { Card, Row } from "../../components/ui/card";
import { useT } from "../../core/i18n";
import { useAllModules } from "../../core/plugins/modules";
import { pluginKey } from "../../core/plugins/store";
import type { PluginInfo } from "../../core/plugins/types";
import { moduleEnabled, readSetting, setSetting } from "../../core/settings";
import { moduleShortcutId } from "../../core/shortcuts";
import type { IslandModule } from "../../core/types";
import { BackLink, Title } from "../components/Heading";
import { PlacementSelect } from "../components/PlacementSelect";
import { ShortcutRow } from "../components/ShortcutRow";
import { Toggle, ToggleRow } from "../components/Toggle";

export function ModulePage({ values }: { values: Record<string, unknown> }) {
	const { id } = useParams();
	const modules = useAllModules();
	const module = modules.find((m) => m.id === id);
	if (!module) return <Navigate to="/modules" replace />;
	// Keyed so each module's `useHiddenSettings` hook gets its own component.
	return <ModuleSettings key={module.id} module={module} values={values} />;
}

const noHidden = () => [] as string[];

function ModuleSettings({ module, values }: { module: IslandModule; values: Record<string, unknown> }) {
	const t = useT();
	const hidden = (module.useHiddenSettings ?? noHidden)();
	const settings = module.settings?.filter((def) => !hidden.includes(def.key)) ?? [];

	const enabledDef = moduleEnabled(module);
	const enabled = readSetting(values, enabledDef);
	const Section = module.SettingsSection;

	return (
		<>
			<BackLink to="/modules">{t("modules.title")}</BackLink>
			<Title icon={module.settingsIcon}>{t(module.title)}</Title>
			{module.plugin && <FromPlugin plugin={module.plugin.plugin} />}
			<Card>
				<Row as="label" label={t("settings.module.label")} desc={t("settings.module.desc")}>
					<Toggle checked={enabled} onChange={(v) => setSetting(enabledDef, v)} />
				</Row>
				<Row label={t("layout.place")} desc={t("layout.placeDesc")} disabled={!enabled}>
					<PlacementSelect moduleId={module.id} disabled={!enabled} />
				</Row>
			</Card>
			<motion.div
				className="flex flex-col gap-3.5"
				initial={false}
				animate={{ opacity: enabled ? 1 : 0.4 }}
				style={{ pointerEvents: enabled ? "auto" : "none" }}
			>
				{!!settings.length && (
					<Card>
						{settings.map((def) => (
							<ToggleRow key={def.key} def={def} value={readSetting(values, def)} />
						))}
					</Card>
				)}
				<Card>
					<ShortcutRow id={moduleShortcutId(module)} values={values} />
				</Card>
				{Section &&
					(module.settingsSectionCards ? (
						<Section />
					) : (
						<Card>
							<Section />
						</Card>
					))}
			</motion.div>
		</>
	);
}

/** A plugin's module links back to the plugin's own page. */
function FromPlugin({ plugin }: { plugin: PluginInfo }) {
	const t = useT();
	const navigate = useNavigate();
	const name = t(pluginKey(plugin.id, plugin.manifest?.name ?? plugin.id));
	return (
		<Card>
			<Row label={t("plugins.module.from", { name })}>
				<Button onClick={() => navigate(`/plugins/${plugin.id}`)}>{t("plugins.module.open")}</Button>
			</Row>
		</Card>
	);
}

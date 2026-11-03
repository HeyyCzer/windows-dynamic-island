import { motion } from "motion/react";
import { Navigate, useParams } from "react-router";
import { Card, Row } from "../../components/ui/card";
import { useT } from "../../core/i18n";
import { useInstalledPlugins } from "../../core/plugins/registry";
import { moduleEnabled, readSetting, setSetting } from "../../core/settings";
import type { IslandModule } from "../../core/types";
import { useAllModules } from "../../modules";
import { BackLink, Title } from "../components/Heading";
import { PlacementSelect } from "../components/PlacementSelect";
import { Toggle, ToggleRow } from "../components/Toggle";
import { PluginPage } from "./PluginPage";

export function ModulePage({ values }: { values: Record<string, unknown> }) {
	const { id } = useParams();
	const plugins = useInstalledPlugins();
	const allModules = useAllModules();
	const plugin = plugins.find((p) => p.manifest.id === id);
	if (plugin) {
		return <PluginPage pluginId={id} from="modules" values={values} />;
	}
	const module = allModules.find((m) => m.id === id);
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
				{Section && (
					<Card>
						<Section />
					</Card>
				)}
			</motion.div>
		</>
	);
}

import { type ReactNode, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { PluginIcon } from "../../../components/plugins/Segments";
import { Button, LinkButton } from "../../../components/ui/button";
import { Block, Card, Desc, Row, RowText } from "../../../components/ui/card";
import { command } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { pluginEnabled, pluginKey, pluginModuleId, pluginShortcutId, usePlugins } from "../../../core/plugins/store";
import type { PluginInfo } from "../../../core/plugins/types";
import { readSetting, setSetting } from "../../../core/settings";
import { BackLink, Title } from "../../components/Heading";
import { ShortcutRow } from "../../components/ShortcutRow";
import { Toggle } from "../../components/Toggle";
import { PermissionList, PluginSettingRow } from "./shared";

export function PluginPage({ values }: { values: Record<string, unknown> }) {
	const { id } = useParams();
	const plugin = usePlugins().find((p) => p.id === id);
	if (!plugin) return <Navigate to="/plugins" replace />;
	return <PluginDetails plugin={plugin} values={values} />;
}

function PluginDetails({ plugin, values }: { plugin: PluginInfo; values: Record<string, unknown> }) {
	const t = useT();
	const navigate = useNavigate();
	const [confirming, setConfirming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const manifest = plugin.manifest;
	const tr = (key: string) => t(pluginKey(plugin.id, key));
	const enabledDef = pluginEnabled(plugin.id);
	const enabled = readSetting(values, enabledDef);

	const uninstall = async () => {
		if (!confirming) {
			setConfirming(true);
			return;
		}
		try {
			await command("plugin_uninstall", { id: plugin.id });
			navigate("/plugins", { replace: true });
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	return (
		<>
			<BackLink to="/plugins">{t("plugins.title")}</BackLink>
			<Title icon={<PluginIcon pluginId={plugin.id} path={manifest?.icon} size={18} />}>
				{manifest ? tr(manifest.name) : plugin.id}
			</Title>

			{(plugin.problem || !manifest) && (
				<Card className="py-3">
					<Desc tone="error">
						{plugin.problem === "tampered"
							? t("plugins.problem.tampered")
							: t("plugins.problem.invalid", { error: plugin.error ?? "" })}
					</Desc>
				</Card>
			)}

			{manifest && (
				<Card>
					<Row as="label" label={t("plugins.enabled.label")} desc={t("plugins.enabled.desc")}>
						<Toggle checked={enabled} onChange={(v) => setSetting(enabledDef, v)} />
					</Row>
				</Card>
			)}

			<Card>
				<Block>
					<RowText
						label={t("plugins.page.about")}
						desc={manifest?.description ? tr(manifest.description) : undefined}
					/>
					<dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[12.5px]">
						<Fact label={t("plugins.page.version")}>{plugin.version}</Fact>
						{plugin.dev ? (
							<Fact label={t("plugins.page.folder")}>{plugin.devPath ?? "—"}</Fact>
						) : (
							<Fact label={t("plugins.page.source")}>{plugin.source ?? "—"}</Fact>
						)}
						{manifest?.author && <Fact label={t("plugins.page.author")}>{manifest.author}</Fact>}
						{manifest?.homepage && (
							<Fact label={t("plugins.page.homepage")}>
								<LinkButton onClick={() => command("open_external", { url: manifest.homepage })}>
									{manifest.homepage.replace(/^https:\/\//, "")}
								</LinkButton>
							</Fact>
						)}
						<Fact label={t("plugins.page.integrity")}>
							{plugin.dev
								? t("plugins.page.unverified")
								: plugin.problem === "tampered"
									? "✕"
									: `✓ ${t("plugins.page.verified")}`}
						</Fact>
						<Fact label="SDK">{manifest?.sdk ?? "—"}</Fact>
						<Fact label={t("plugins.page.background")}>
							{!manifest?.background
								? t("plugins.background.none")
								: manifest.persistent
									? `${t("plugins.background.persistent")} · ${t("plugins.background.persistentHint")}`
									: t("plugins.background.onDemand")}
						</Fact>
					</dl>
				</Block>
			</Card>

			<Card>
				<Block>
					<RowText
						label={t("plugins.page.permissions")}
						desc={plugin.granted.length ? undefined : t("plugins.confirm.none")}
					/>
					{!!plugin.granted.length && <PermissionList permissions={plugin.granted} />}
				</Block>
			</Card>

			{manifest && !!manifest.modules.length && (
				<Card>
					<Block>
						<RowText label={t("plugins.page.modules")} />
						<ul className="flex list-none flex-col gap-1">
							{manifest.modules.map((m) => (
								<li key={m.id}>
									<button
										type="button"
										className="flex w-full items-center gap-2.5 rounded-[9px] bg-white/4 px-3 py-2 text-left text-[13px] font-[550] hover:bg-white/7"
										onClick={() => navigate(`/modules/${pluginModuleId(plugin.id, m.id)}`)}
									>
										<PluginIcon pluginId={plugin.id} path={m.icon ?? manifest.icon} />
										<span className="flex-1">{tr(m.title)}</span>
										<span className="text-text-faint">›</span>
									</button>
								</li>
							))}
						</ul>
					</Block>
				</Card>
			)}

			{manifest && !!manifest.settings.length && (
				<Card>
					{manifest.settings.map((def) => (
						<PluginSettingRow key={def.key} pluginId={plugin.id} def={def} values={values} />
					))}
				</Card>
			)}

			{manifest && !!manifest.shortcuts.length && (
				<Card>
					{manifest.shortcuts.map((s) => (
						<ShortcutRow key={s.id} id={pluginShortcutId(plugin.id, s.id)} values={values} label={tr(s.label)} />
					))}
				</Card>
			)}

			<div className="flex items-center justify-end gap-3">
				{error && <Desc tone="error">{error}</Desc>}
				<Button variant="danger" onClick={uninstall} onBlur={() => setConfirming(false)}>
					{confirming ? t("plugins.page.uninstallConfirm") : t("plugins.page.uninstall")}
				</Button>
			</div>
		</>
	);
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
	return (
		<>
			<dt className="text-text-faint">{label}</dt>
			<dd className="m-0 min-w-0 truncate select-text">{children}</dd>
		</>
	);
}

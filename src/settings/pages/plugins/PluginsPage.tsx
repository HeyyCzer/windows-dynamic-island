import {
	BookOpenIcon,
	CodeXmlIcon,
	FolderOpenIcon,
	RefreshCwIcon,
	ShieldAlertIcon,
	TriangleAlertIcon,
	XIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { PluginIcon } from "../../../components/plugins/Segments";
import { Button, IconButton } from "../../../components/ui/button";
import { Block, Card, Collapsible, Desc, List, ListItem, RowText } from "../../../components/ui/card";
import { Input, Segmented } from "../../../components/ui/form";
import { Chip, Empty, SectionLabel } from "../../../components/ui/text";
import { command, isTauri } from "../../../core/bridge";
import { cn } from "../../../core/cn";
import { useT } from "../../../core/i18n";
import { pluginEnabled, pluginKey, usePlugins } from "../../../core/plugins/store";
import type { CatalogEntry, CatalogSource, PluginInfo, PluginSource } from "../../../core/plugins/types";
import { readSetting, setSetting } from "../../../core/settings";
import { Lead, Title } from "../../components/Heading";
import { Toggle } from "../../components/Toggle";
import { ConfirmInstall, Dialog, PersistentChip, TrustNotice, useLocalize } from "./shared";

type Tab = "installed" | "marketplace" | "sources";

/** Remembered while the settings window stays open. */
let lastTab: Tab = "installed";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Plugins: what's installed, the marketplace (every plugin of every source the
 * user added) and the sources themselves. Each installed plugin has its own
 * page (`PluginPage`).
 */
export function PluginsPage({ values }: { values: Record<string, unknown> }) {
	const t = useT();
	const [tab, setTab] = useState<Tab>(lastTab);
	const pick = (next: Tab) => {
		lastTab = next;
		setTab(next);
	};
	return (
		<>
			<div className="flex items-center justify-between gap-4">
				<Title>{t("plugins.title")}</Title>
				<Segmented
					value={tab}
					onChange={pick}
					options={[
						{ value: "installed", label: t("plugins.tabs.installed") },
						{ value: "marketplace", label: t("plugins.tabs.marketplace") },
						{ value: "sources", label: t("plugins.tabs.sources") },
					]}
				/>
			</div>
			<Lead>{t("plugins.desc")}</Lead>
			{tab === "installed" && <Installed values={values} onBrowse={() => pick("marketplace")} />}
			{tab === "marketplace" && (
				<>
					<TrustNotice />
					<Marketplace onSources={() => pick("sources")} />
				</>
			)}
			{tab === "sources" && <Sources />}
		</>
	);
}

function Installed({ values, onBrowse }: { values: Record<string, unknown>; onBrowse: () => void }) {
	const t = useT();
	const plugins = usePlugins();
	return (
		<>
			{plugins.length ? (
				<Card className="py-1.5">
					<ul className="list-none">
						{plugins.map((p) => (
							<InstalledRow key={p.id} plugin={p} enabled={readSetting(values, pluginEnabled(p.id))} />
						))}
					</ul>
				</Card>
			) : (
				<Card className="flex flex-col items-center gap-3 py-8">
					<Empty>{t("plugins.installed.empty")}</Empty>
					<Button onClick={onBrowse}>{t("plugins.tabs.marketplace")}</Button>
				</Card>
			)}
			<DeveloperMode />
		</>
	);
}

function InstalledRow({ plugin, enabled }: { plugin: PluginInfo; enabled: boolean }) {
	const t = useT();
	const navigate = useNavigate();
	const broken = !!plugin.problem || !plugin.manifest;
	const name = plugin.manifest ? t(pluginKey(plugin.id, plugin.manifest.name)) : plugin.id;
	const open = () => navigate(`/plugins/${plugin.id}`);
	return (
		<li className="flex min-h-12 items-center gap-2.5 rounded-[9px] px-1.5 hover:bg-white/4">
			<button type="button" className="group/open flex min-w-0 flex-1 items-center gap-3 py-2 text-left" onClick={open}>
				<span className={cn("grid size-7 flex-none place-items-center", (!enabled || broken) && "opacity-40")}>
					<PluginIcon pluginId={plugin.id} path={plugin.manifest?.icon} size={20} />
				</span>
				<span className="flex min-w-0 flex-1 flex-col">
					<span className="flex items-center gap-2">
						<span className="truncate text-[13.5px] font-semibold group-hover/open:underline">{name}</span>
						<span className="text-[11.5px] text-text-faint">{t("plugins.version", { version: plugin.version })}</span>
						{plugin.dev && <Chip icon={<CodeXmlIcon size={12} />}>{t("plugins.dev")}</Chip>}
						{plugin.manifest?.persistent && <PersistentChip />}
					</span>
					{broken ? (
						<Desc tone="error" className="truncate">
							{plugin.problem === "tampered"
								? t("plugins.problem.tampered")
								: t("plugins.problem.invalid", { error: plugin.error ?? "" })}
						</Desc>
					) : (
						plugin.manifest?.description && (
							<Desc className="truncate">{t(pluginKey(plugin.id, plugin.manifest.description))}</Desc>
						)
					)}
				</span>
			</button>
			<Toggle checked={enabled} disabled={broken} onChange={(v) => setSetting(pluginEnabled(plugin.id), v)} />
			<button
				type="button"
				className="h-7 w-5.5 rounded-[7px] text-[18px] leading-none text-text-faint hover:bg-white/6 hover:text-text"
				onClick={open}
			>
				›
			</button>
		</li>
	);
}

/** Load a plugin from a folder while writing it. */
const DOCS_URL = "https://github.com/HeyyCzer/windows-island/tree/main/docs/plugins";
const openDocs = () => (isTauri ? command("open_external", { url: DOCS_URL }) : window.open(DOCS_URL, "_blank"));

function DeveloperMode() {
	const t = useT();
	const [path, setPath] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const run = async (f: () => Promise<unknown>) => {
		setBusy(true);
		setError(null);
		try {
			await f();
		} catch (e) {
			setError(message(e));
		} finally {
			setBusy(false);
		}
	};
	const load = () => run(() => command("plugin_load_dev", { path }));
	const pick = () =>
		run(async () => {
			const folder = await command<string | null>("plugin_pick_dev_folder");
			if (folder) {
				setPath(folder);
				await command("plugin_load_dev", { path: folder });
			}
		});
	return (
		<Collapsible title={t("plugins.devMode.title")}>
			<Block>
				<RowText label="" desc={t("plugins.devMode.desc")} />
				<div className="flex gap-2">
					<Input
						className="flex-1 font-[Cascadia_Code,Consolas,monospace] text-[12px]"
						placeholder={t("plugins.devMode.placeholder")}
						value={path}
						onChange={(e) => setPath(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && path && load()}
					/>
					<Button onClick={pick} disabled={busy}>
						<FolderOpenIcon size={14} />
						{t("plugins.devMode.pick")}
					</Button>
					<Button variant="primary" onClick={load} disabled={busy || !path.trim()}>
						{t("plugins.devMode.load")}
					</Button>
				</div>
				{error && <Desc tone="error">{error}</Desc>}
				<div className="flex gap-2">
					<Button onClick={() => run(() => command("plugins_reload"))} disabled={busy}>
						<RefreshCwIcon size={13} />
						{t("plugins.devMode.reload")}
					</Button>
					<Button onClick={openDocs}>
						<BookOpenIcon size={13} />
						{t("plugins.devMode.docs")}
					</Button>
				</div>
			</Block>
		</Collapsible>
	);
}

interface Pending {
	source: PluginSource;
	entry: CatalogEntry;
}

function Marketplace({ onSources }: { onSources: () => void }) {
	const t = useT();
	const localize = useLocalize();
	const [catalog, setCatalog] = useState<CatalogSource[] | null>(null);
	const [pending, setPending] = useState<Pending | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setCatalog(null);
		try {
			setCatalog((await command<CatalogSource[]>("plugin_catalog")) ?? []);
		} catch (e) {
			setCatalog([]);
			setError(message(e));
		}
	}, []);
	useEffect(() => {
		void load();
	}, [load]);

	const install = async () => {
		if (!pending) return;
		setBusy(true);
		setError(null);
		try {
			await command("plugin_install", {
				source: pending.source.id,
				id: pending.entry.id,
				approved: pending.entry.permissions,
			});
			setPending(null);
			await load();
		} catch (e) {
			setError(message(e));
		} finally {
			setBusy(false);
		}
	};

	if (!catalog) return <Empty className="py-10">{t("plugins.marketplace.loading")}</Empty>;
	if (!catalog.length)
		return (
			<Card className="flex flex-col items-center gap-3 py-8">
				<Empty>{t("plugins.marketplace.empty")}</Empty>
				<Button onClick={onSources}>{t("plugins.tabs.sources")}</Button>
			</Card>
		);

	return (
		<>
			<div className="flex justify-end">
				<Button onClick={load}>
					<RefreshCwIcon size={13} />
					{t("plugins.marketplace.refresh")}
				</Button>
			</div>
			{catalog.map(({ source, name, plugins, error: sourceError }) => (
				<section key={source.id} className="flex flex-col gap-2">
					<SectionLabel className="px-1">{localize(name) || source.label}</SectionLabel>
					{sourceError && (
						<Card className="py-3">
							<Desc tone="error">{t("plugins.marketplace.error", { error: sourceError })}</Desc>
						</Card>
					)}
					<div className="grid grid-cols-2 gap-2.5">
						{plugins.map((entry) => (
							<CatalogCard
								key={entry.id}
								entry={entry}
								onInstall={() => {
									setError(null);
									setPending({ source, entry });
								}}
							/>
						))}
					</div>
				</section>
			))}
			<ConfirmInstall
				name={pending ? localize(pending.entry.name) : null}
				update={!!pending?.entry.update}
				permissions={pending?.entry.permissions ?? []}
				persistent={!!pending?.entry.persistent}
				busy={busy}
				error={error}
				onCancel={() => setPending(null)}
				onAccept={install}
			/>
		</>
	);
}

function CatalogCard({ entry, onInstall }: { entry: CatalogEntry; onInstall: () => void }) {
	const t = useT();
	const localize = useLocalize();
	const action = !entry.compatible ? (
		<Chip icon={<TriangleAlertIcon size={12} />}>{t("plugins.marketplace.incompatible")}</Chip>
	) : entry.update ? (
		<Button variant="primary" onClick={onInstall}>
			{t("plugins.marketplace.update", { version: entry.version })}
		</Button>
	) : entry.installed ? (
		<Chip ok>{t("plugins.marketplace.installed")}</Chip>
	) : (
		<Button variant="primary" onClick={onInstall}>
			{t("plugins.marketplace.install")}
		</Button>
	);
	return (
		<Card className="flex flex-col gap-2 px-4 py-3.5">
			<div className="flex items-center gap-2.5">
				{entry.icon ? (
					<img src={entry.icon} alt="" width={26} height={26} className="flex-none rounded-md" />
				) : (
					<span className="size-6.5 flex-none rounded-md bg-white/8" />
				)}
				<span className="flex min-w-0 flex-col">
					<span className="truncate text-[13.5px] font-semibold">{localize(entry.name)}</span>
					<span className="truncate text-[11.5px] text-text-faint">
						{t("plugins.version", { version: entry.version })}
						{entry.author && ` · ${t("plugins.marketplace.by", { author: entry.author })}`}
					</span>
				</span>
			</div>
			{entry.description && <Desc className="line-clamp-3 min-h-[2.9em]">{localize(entry.description)}</Desc>}
			<div className="mt-auto flex items-center justify-between gap-2 pt-1">
				<span className="flex min-w-0 items-center gap-2 text-[11.5px] text-text-faint">
					{entry.persistent && <PersistentChip />}
					{entry.permissions.length ? `${entry.permissions.length} ${t("plugins.page.permissions").toLowerCase()}` : ""}
				</span>
				{action}
			</div>
		</Card>
	);
}

function Sources() {
	const t = useT();
	const [sources, setSources] = useState<PluginSource[]>([]);
	const [input, setInput] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	/** The source waiting for the user to accept the warning. */
	const [confirming, setConfirming] = useState<string | null>(null);
	const load = useCallback(async () => setSources((await command<PluginSource[]>("plugin_sources")) ?? []), []);
	useEffect(() => {
		void load();
	}, [load]);

	const ask = () => {
		if (!input.trim() || busy) return;
		setError(null);
		setConfirming(input.trim());
	};
	const add = async () => {
		setConfirming(null);
		setBusy(true);
		setError(null);
		try {
			await command("plugin_source_add", { input });
			setInput("");
			await load();
		} catch (e) {
			setError(message(e));
		} finally {
			setBusy(false);
		}
	};
	const remove = async (id: string) => {
		await command("plugin_source_remove", { id });
		await load();
	};

	return (
		<>
			<Card>
				<Block>
					<RowText label={t("plugins.tabs.sources")} desc={t("plugins.sources.desc")} />
					{sources.length ? (
						<List>
							{sources.map((s) => (
								<ListItem key={s.id} name={s.label}>
									<IconButton size="sm" tone="danger" title={t("plugins.sources.remove")} onClick={() => remove(s.id)}>
										<XIcon size={11} />
									</IconButton>
								</ListItem>
							))}
						</List>
					) : (
						<Desc>{t("plugins.sources.empty")}</Desc>
					)}
					<div className="flex gap-2">
						<Input
							className="flex-1"
							placeholder={t("plugins.sources.placeholder")}
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && ask()}
						/>
						<Button variant="primary" onClick={ask} disabled={busy || !input.trim()}>
							{busy ? t("plugins.sources.adding") : t("plugins.sources.add")}
						</Button>
					</div>
					{error && <Desc tone="error">{error}</Desc>}
				</Block>
			</Card>
			<Dialog open={confirming !== null}>
				<h2 className="text-[17px] font-bold break-all">
					{t("plugins.sources.confirm.title", { source: confirming ?? "" })}
				</h2>
				<p className="flex items-start gap-2 rounded-lg bg-warn/8 px-3 py-2 text-[12.5px]/snug text-text-dim">
					<ShieldAlertIcon size={14} className="mt-0.5 flex-none text-warn" />
					{t("plugins.sources.confirm.body")}
				</p>
				<div className="mt-1 flex justify-end gap-2">
					<Button onClick={() => setConfirming(null)}>{t("plugins.confirm.cancel")}</Button>
					<Button variant="primary" onClick={add}>
						{t("plugins.sources.confirm.accept")}
					</Button>
				</div>
			</Dialog>
		</>
	);
}

import {
	CheckIcon,
	Code2Icon,
	DownloadIcon,
	ExternalLinkIcon,
	FolderArchiveIcon,
	PackageIcon,
	RefreshCwIcon,
	SearchIcon,
	SlidersIcon,
	SparklesIcon,
	Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Card } from "../../components/ui/card";
import { openExternal } from "../../core/bridge";
import { useT } from "../../core/i18n";
import { useCatalog } from "../../core/plugins/catalog";
import {
	installLocalPlugin,
	installPlugin,
	renderPluginIcon,
	togglePlugin,
	uninstallPlugin,
	useInstalledPlugins,
} from "../../core/plugins/registry";
import type { PluginCategory, PluginManifest } from "../../core/plugins/types";
import { Lead, Title } from "../components/Heading";
import { Toggle } from "../components/Toggle";

const CATEGORIES: {
	id: PluginCategory | "all";
	label:
		| "marketplace.ui.categoryAll"
		| "marketplace.ui.categoryProductivity"
		| "marketplace.ui.categoryTools"
		| "marketplace.ui.categoryMedia";
}[] = [
	{ id: "all", label: "marketplace.ui.categoryAll" },
	{ id: "productivity", label: "marketplace.ui.categoryProductivity" },
	{ id: "tools", label: "marketplace.ui.categoryTools" },
	{ id: "media", label: "marketplace.ui.categoryMedia" },
];

export function MarketplacePage() {
	const t = useT();
	const navigate = useNavigate();
	const [tab, setTab] = useState<"explore" | "installed" | "sideload">("explore");
	const [search, setSearch] = useState("");
	const [activeCategory, setActiveCategory] = useState<PluginCategory | "all">("all");

	// Direct sideload & install state
	const [importLoading, setImportLoading] = useState(false);
	const [importError, setImportError] = useState<string | null>(null);
	const [importSuccess, setImportSuccess] = useState<string | null>(null);

	const installed = useInstalledPlugins();
	const { catalog, error: catalogError, loading: catalogLoading, refresh } = useCatalog();
	useEffect(() => {
		void refresh();
	}, [refresh]);

	const installFromCatalog = async (manifest: PluginManifest) => {
		setImportError(null);
		setImportLoading(true);
		try {
			await installPlugin(manifest);
			setImportSuccess(t("marketplace.ui.successInstalled", { name: manifest.name }));
		} catch (err) {
			if (err instanceof Error && err.message !== "已取消安装") setImportError(err.message);
		} finally {
			setImportLoading(false);
		}
	};

	const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		setImportError(null);
		setImportSuccess(null);
		const reader = new FileReader();
		reader.onload = (event) => {
			try {
				const content = event.target?.result as string;
				setImportLoading(true);
				void installLocalPlugin(content)
					.then((plugin) => {
						setImportSuccess(t("marketplace.ui.successImported", { name: plugin.manifest.name }));
						setTab("installed");
					})
					.catch((err: unknown) => {
						if (err instanceof Error && err.message !== "已取消安装")
							setImportError(t("marketplace.ui.importFailed", { error: err.message }));
					})
					.finally(() => setImportLoading(false));
			} catch (err) {
				setImportError(t("marketplace.ui.parseFailed", { error: err instanceof Error ? err.message : String(err) }));
			}
		};
		reader.readAsText(file);
	};

	// Filter explore catalog
	const filteredCatalog = catalog.filter((plugin) => {
		const matchCategory = activeCategory === "all" || plugin.category === activeCategory;
		const query = search.trim().toLowerCase();
		const matchSearch =
			!query ||
			plugin.name.toLowerCase().includes(query) ||
			plugin.description.toLowerCase().includes(query) ||
			plugin.tags?.some((t) => t.toLowerCase().includes(query)) ||
			plugin.author.name.toLowerCase().includes(query);
		return matchCategory && matchSearch;
	});

	return (
		<div className="flex flex-col gap-5">
			<div>
				<Title>{t("marketplace.title")}</Title>
				<Lead>{t("marketplace.desc")}</Lead>
				<div className="mt-2 flex items-start justify-between gap-3 rounded-lg border border-amber-400/15 bg-amber-400/5 px-3 py-2 text-[11px] leading-relaxed text-text-faint">
					<p>{t("marketplace.ui.safety")}</p>
					<button
						type="button"
						onClick={() => void refresh()}
						disabled={catalogLoading}
						className="flex shrink-0 items-center gap-1 text-accent disabled:opacity-50"
					>
						<RefreshCwIcon size={12} className={catalogLoading ? "animate-spin" : ""} />
						{t("marketplace.ui.refresh")}
					</button>
				</div>
				{catalogError && (
					<p className="mt-2 text-xs text-amber-200">{t("marketplace.ui.catalogError", { error: catalogError })}</p>
				)}
			</div>

			{/* Sub Tabs */}
			<div className="flex items-center gap-1 rounded-xl border border-white/6 bg-white/3 p-1">
				<TabButton active={tab === "explore"} onClick={() => setTab("explore")}>
					<PackageIcon size={14} />
					<span>{t("marketplace.ui.explore")}</span>
				</TabButton>
				<TabButton active={tab === "installed"} onClick={() => setTab("installed")}>
					<CheckIcon size={14} />
					<span>{t("marketplace.ui.installed")}</span>
					<span className="ml-1 rounded-full bg-white/10 px-1.5 py-0.2 text-[10px] text-text-faint">
						{installed.length}
					</span>
				</TabButton>
				<TabButton active={tab === "sideload"} onClick={() => setTab("sideload")}>
					<Code2Icon size={14} />
					<span>{t("marketplace.ui.importTab")}</span>
				</TabButton>
			</div>

			{/* Tab 1: Explore */}
			{tab === "explore" && (
				<div className="flex flex-col gap-4">
					{/* Search & Categories */}
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div className="relative flex-1">
							<SearchIcon size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-text-faint" />
							<input
								type="text"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder={t("marketplace.ui.search")}
								className="h-9 w-full rounded-lg border border-white/8 bg-white/4 pr-3 pl-8 text-xs text-text placeholder:text-text-faint focus:border-white/20 focus:outline-none"
							/>
						</div>
						<div className="flex flex-wrap items-center gap-1.5">
							{CATEGORIES.map((cat) => (
								<button
									key={cat.id}
									type="button"
									onClick={() => setActiveCategory(cat.id)}
									className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
										activeCategory === cat.id
											? "bg-white/15 text-white"
											: "bg-white/4 text-text-faint hover:bg-white/8 hover:text-text"
									}`}
								>
									{t(cat.label)}
								</button>
							))}
						</div>
					</div>

					{/* Plugin Grid */}
					<div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
						{filteredCatalog.map((plugin) => {
							const isInstalled = installed.some((p) => p.manifest.id === plugin.id);
							return (
								<PluginCard
									key={plugin.id}
									plugin={plugin}
									isInstalled={isInstalled}
									onInstall={() => void installFromCatalog(plugin)}
									onConfigure={() => navigate(`/plugins/${plugin.id}`)}
								/>
							);
						})}
					</div>

					{filteredCatalog.length === 0 && (
						<div className="flex flex-col items-center justify-center py-12 text-center text-text-faint">
							<PackageIcon size={32} className="mb-2 opacity-30" />
							<p className="text-sm">{t("marketplace.ui.noResults")}</p>
							<p className="text-xs opacity-60">{t("marketplace.ui.searchHint")}</p>
						</div>
					)}
				</div>
			)}

			{/* Tab 2: Installed */}
			{tab === "installed" && (
				<div className="flex flex-col gap-3">
					{installed.map((item) => (
						<Card key={item.manifest.id} className="p-3.5 overflow-hidden transition-all hover:border-white/12">
							<div className="flex items-center justify-between gap-3 min-w-0">
								<div
									className="group/item flex min-w-0 flex-1 items-center gap-3 cursor-pointer"
									onClick={() => navigate(`/plugins/${item.manifest.id}`)}
								>
									<div
										className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-white/6 transition-transform group-hover/item:scale-105"
										style={{ color: item.manifest.accentColor }}
									>
										{renderPluginIcon(item.manifest.icon, 20)}
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<h4 className="truncate text-[13px] font-semibold text-text group-hover/item:text-accent transition-colors">
												{item.manifest.titleKey ? t(item.manifest.titleKey) : item.manifest.name}
											</h4>
											<span className="flex-none rounded bg-white/8 px-1.5 py-0.2 text-[10px] text-text-faint">
												v{item.manifest.version}
											</span>
											<span className="flex-none rounded bg-white/5 px-1.5 py-0.2 text-[10px] text-text-faint">
												{t(
													item.source === "marketplace"
														? "marketplace.ui.sourceMarketplace"
														: "marketplace.ui.sourceLocal",
												)}
											</span>
										</div>
										<p className="truncate text-xs text-text-faint">
											{item.manifest.descKey ? t(item.manifest.descKey) : item.manifest.description}
										</p>
									</div>
								</div>

								<div className="flex flex-none items-center gap-2">
									{(() => {
										const available = catalog.find((entry) => entry.id === item.manifest.id);
										const needsDownload = !item.packageSha256;
										const updateAvailable = Boolean(
											item.packageSha256 && available?.sha256 && item.packageSha256 !== available.sha256,
										);
										return (needsDownload || updateAvailable) && available ? (
											<button
												type="button"
												disabled={importLoading}
												onClick={() => void installFromCatalog(available)}
												className="flex h-7 items-center gap-1 rounded-lg bg-accent/15 px-2.5 text-[11px] font-medium text-accent hover:bg-accent/25 disabled:opacity-50"
											>
												<RefreshCwIcon size={12} />
												{t(needsDownload ? "marketplace.ui.downloadInstalled" : "marketplace.ui.update")}
											</button>
										) : null;
									})()}
									<button
										type="button"
										onClick={() => navigate(`/plugins/${item.manifest.id}`)}
										className="flex h-7 items-center gap-1.5 rounded-lg border border-white/8 bg-white/4 px-2.5 text-xs text-text-faint hover:bg-white/10 hover:text-text transition-colors cursor-pointer"
									>
										<SlidersIcon size={13} />
										<span>{t("marketplace.ui.configure")}</span>
									</button>
									<Toggle checked={item.enabled} onChange={() => togglePlugin(item.manifest.id)} />
									<button
										type="button"
										onClick={() => uninstallPlugin(item.manifest.id)}
										title={t("marketplace.ui.uninstall")}
										className="flex h-7 w-7 items-center justify-center rounded-lg text-text-faint hover:bg-red-500/10 hover:text-red-400 cursor-pointer"
									>
										<Trash2Icon size={14} />
									</button>
								</div>
							</div>
						</Card>
					))}

					{installed.length === 0 && (
						<div className="flex flex-col items-center justify-center py-12 text-center text-text-faint">
							<CheckIcon size={32} className="mb-2 opacity-30" />
							<p className="text-sm">{t("marketplace.ui.noInstalled")}</p>
							<button
								type="button"
								onClick={() => setTab("explore")}
								className="mt-3 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-text hover:bg-white/15"
							>
								{t("marketplace.ui.browse")}
							</button>
						</div>
					)}
				</div>
			)}

			{/* Tab 3: Sideload & Dev */}
			{tab === "sideload" && (
				<div className="flex flex-col gap-4">
					{/* Status feedback */}
					{importSuccess && (
						<div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-2.5 text-xs text-emerald-400 flex items-center gap-2">
							<CheckIcon size={14} />
							<span>{importSuccess}</span>
						</div>
					)}
					{importError && (
						<div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-3.5 py-2.5 text-xs text-rose-400">
							{importError}
						</div>
					)}

					{/* Import an actual executable package, not a metadata manifest. */}
					<Card className="p-4">
						<div className="flex items-start gap-3">
							<div className="rounded-lg bg-sky-500/10 p-2 text-sky-400">
								<FolderArchiveIcon size={20} />
							</div>
							<div className="flex-1">
								<h4 className="text-sm font-semibold text-text">{t("marketplace.ui.importTitle")}</h4>
								<p className="mt-1 text-xs text-text-faint">{t("marketplace.ui.importDesc")}</p>
								<div className="mt-3 flex items-center gap-2">
									<label
										className={`flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-text hover:bg-white/15 ${importLoading ? "pointer-events-none opacity-50" : ""}`}
									>
										<DownloadIcon size={13} />
										<span>{t(importLoading ? "marketplace.ui.importing" : "marketplace.ui.chooseFile")}</span>
										<input
											type="file"
											accept=".island-plugin.json,application/json"
											className="hidden"
											onChange={handleFileImport}
										/>
									</label>
								</div>
							</div>
						</div>
					</Card>

					{/* Developer reference */}
					<Card className="p-4">
						<div className="flex items-start gap-3">
							<div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-400">
								<SparklesIcon size={20} />
							</div>
							<div className="flex-1">
								<h4 className="text-sm font-semibold text-text">{t("marketplace.ui.guideTitle")}</h4>
								<p className="mt-1 text-xs text-text-faint">{t("marketplace.ui.guideDesc")}</p>
								<div className="mt-2.5 flex flex-col gap-2 text-xs text-text-muted">
									<div className="flex items-start gap-2">
										<span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-white/8 text-[10px] font-bold text-text-dim">
											1
										</span>
										<span>
											<strong>{t("marketplace.ui.guideStepTitleOne")}</strong> {t("marketplace.ui.guideStepOne")}
										</span>
									</div>
									<div className="flex items-start gap-2">
										<span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-white/8 text-[10px] font-bold text-text-dim">
											2
										</span>
										<span>
											<strong>{t("marketplace.ui.guideStepTitleTwo")}</strong> {t("marketplace.ui.guideStepTwo")}
										</span>
									</div>
								</div>

								<div className="mt-3 rounded-lg border border-white/6 bg-black/30 p-3 font-mono text-[11px] text-white/70">
									<p className="text-amber-300">{t("marketplace.ui.packageComment")}</p>
									<p>&#123;</p>
									<p className="pl-4">&quot;formatVersion&quot;: 1,</p>
									<p className="pl-4">&quot;manifest&quot;: &#123;</p>
									<p className="pl-8">&quot;id&quot;: &quot;com.example.my-widget&quot;,</p>
									<p className="pl-8">
										&quot;name&quot;: &quot;My Widget&quot;, &quot;version&quot;: &quot;1.0.0&quot;,
									</p>
									<p className="pl-8">&quot;sdkVersion&quot;: 1, &quot;category&quot;: &quot;tools&quot;</p>
									<p className="pl-4">&#125;,</p>
									<p className="pl-4">&quot;code&quot;: &quot;... compiled plugin ...&quot;,</p>
									<p className="pl-4">&quot;css&quot;: &quot;... plugin styles ...&quot;</p>
									<p>&#125;</p>
								</div>
								<div className="mt-3">
									<a
										href="https://github.com/shawn89890916/windows-dynamic-island/blob/main/plugins/DEVELOPING.md"
										target="_blank"
										rel="noreferrer"
										onClick={(event) => {
											event.preventDefault();
											void openExternal(
												"https://github.com/shawn89890916/windows-dynamic-island/blob/main/plugins/DEVELOPING.md",
											);
										}}
										className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
									>
										<span>{t("marketplace.ui.docs")}</span>
										<ExternalLinkIcon size={11} />
									</a>
								</div>
							</div>
						</div>
					</Card>
				</div>
			)}
		</div>
	);
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all ${
				active ? "bg-white/12 text-white shadow-sm" : "text-text-faint hover:text-text"
			}`}
		>
			{children}
		</button>
	);
}

function PluginCard({
	plugin,
	isInstalled,
	onInstall,
	onConfigure,
}: {
	plugin: PluginManifest;
	isInstalled: boolean;
	onInstall: () => void;
	onConfigure?: () => void;
}) {
	const t = useT();
	const title = plugin.titleKey ? t(plugin.titleKey) : plugin.name;
	const desc = plugin.descKey ? t(plugin.descKey) : plugin.description;
	return (
		<Card className="flex flex-col justify-between p-3.5 transition-all hover:border-white/12">
			<div>
				<div className="flex items-start justify-between gap-2">
					<div
						className={`flex items-center gap-2.5 ${isInstalled ? "cursor-pointer group/card" : ""}`}
						onClick={isInstalled ? onConfigure : undefined}
					>
						<div
							className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-white/6"
							style={{ color: plugin.accentColor }}
						>
							{renderPluginIcon(plugin.icon, 18)}
						</div>
						<div className="min-w-0">
							<h4
								className={`truncate text-[13px] font-semibold text-text ${
									isInstalled ? "group-hover/card:text-accent transition-colors" : ""
								}`}
							>
								{title}
							</h4>
							<span className="text-[11px] text-text-faint">by {plugin.author.name}</span>
						</div>
					</div>
					<span className="rounded bg-white/6 px-1.5 py-0.2 text-[10px] text-text-faint">v{plugin.version}</span>
				</div>

				<p className="mt-2.5 text-xs leading-relaxed text-text-muted">{desc}</p>

				{plugin.tags && (
					<div className="mt-3 flex flex-wrap gap-1">
						{plugin.tags.map((tag) => (
							<span key={tag} className="rounded bg-white/4 px-1.5 py-0.5 text-[10px] text-text-faint">
								#{tag}
							</span>
						))}
					</div>
				)}
			</div>

			<div className="mt-4 flex items-center justify-between border-t border-white/6 pt-3">
				<span className="text-[10px] text-text-faint">{t("marketplace.ui.freeOpenSource")}</span>
				{isInstalled ? (
					<div className="flex items-center gap-2">
						<span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
							<CheckIcon size={13} />
							{t("marketplace.ui.installedBadge")}
						</span>
						{onConfigure && (
							<button
								type="button"
								onClick={onConfigure}
								className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium text-text transition-colors hover:bg-white/20 active:scale-95 cursor-pointer"
							>
								<SlidersIcon size={12} />
								<span>{t("marketplace.ui.configure")}</span>
							</button>
						)}
					</div>
				) : (
					<button
						type="button"
						onClick={onInstall}
						className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1 text-xs font-medium text-text transition-colors hover:bg-white/20 active:scale-95 cursor-pointer"
					>
						<DownloadIcon size={12} />
						{t("marketplace.ui.install")}
					</button>
				)}
			</div>
		</Card>
	);
}

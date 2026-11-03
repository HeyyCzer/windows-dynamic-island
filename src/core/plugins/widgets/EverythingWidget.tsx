import {
	ArrowDownUpIcon,
	CheckIcon,
	CodeIcon,
	CopyIcon,
	ExternalLinkIcon,
	FileArchiveIcon,
	FileAudioIcon,
	FileIcon,
	FileImageIcon,
	FileTextIcon,
	FileVideoIcon,
	FolderIcon,
	FolderOpenIcon,
	HelpCircleIcon,
	SearchIcon,
	XIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { command, openExternal, openInFolder } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { useIsland } from "../../../core/island";
import { type EverythingItem, formatEverythingDate, formatFileSize, queryEverything } from "../everythingClient";

type FilterType = "all" | "doc" | "pic" | "media" | "zip" | "app" | "folder";

const FILTERS: { id: FilterType; label: string; prefix: string }[] = [
	{ id: "all", label: "全部", prefix: "" },
	{ id: "doc", label: "文档", prefix: "ext:doc;docx;txt;md;pdf;xlsx;pptx" },
	{ id: "pic", label: "图片", prefix: "ext:jpg;jpeg;png;gif;webp;svg;ico;bmp" },
	{ id: "media", label: "音视频", prefix: "ext:mp4;mkv;avi;mov;mp3;flac;wav;m4a" },
	{ id: "zip", label: "压缩包", prefix: "ext:zip;rar;7z;tar;gz;iso" },
	{ id: "app", label: "程序", prefix: "ext:exe;msi;bat;cmd;ps1;lnk" },
	{ id: "folder", label: "文件夹", prefix: "folder:" },
];

type SortKey = "date_modified" | "name" | "size" | "path";

function getFileIcon(name: string, type: "file" | "folder") {
	if (type === "folder") return <FolderIcon size={14} className="text-amber-400 shrink-0" />;
	const ext = name.split(".").pop()?.toLowerCase();
	switch (ext) {
		case "ts":
		case "tsx":
		case "js":
		case "jsx":
		case "rs":
		case "py":
		case "html":
		case "json":
			return <CodeIcon size={14} className="text-sky-400 shrink-0" />;
		case "md":
		case "txt":
		case "doc":
		case "docx":
		case "pdf":
		case "rtf":
		case "odt":
			return <FileTextIcon size={14} className="text-emerald-400 shrink-0" />;
		case "png":
		case "jpg":
		case "jpeg":
		case "gif":
		case "webp":
		case "svg":
		case "ico":
		case "bmp":
			return <FileImageIcon size={14} className="text-purple-400 shrink-0" />;
		case "mp4":
		case "mkv":
		case "avi":
		case "mov":
		case "wmv":
		case "flv":
			return <FileVideoIcon size={14} className="text-rose-400 shrink-0" />;
		case "mp3":
		case "flac":
		case "wav":
		case "m4a":
		case "aac":
		case "ogg":
			return <FileAudioIcon size={14} className="text-pink-400 shrink-0" />;
		case "zip":
		case "rar":
		case "7z":
		case "tar":
		case "gz":
		case "iso":
			return <FileArchiveIcon size={14} className="text-amber-400 shrink-0" />;
		default:
			return <FileIcon size={14} className="text-text-faint shrink-0" />;
	}
}

function highlightMatch(text: string, query: string) {
	const trimmed = query.trim();
	if (!trimmed) return text;
	const tokens = trimmed
		.split(/\s+/)
		.map((t) => t.replace(/^(ext|path|case|wholeword):[^\s]*/i, ""))
		.filter(Boolean);
	if (!tokens.length) return text;

	try {
		const pattern = new RegExp(`(${tokens.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
		const parts = text.split(pattern);
		return parts.map((part, i) =>
			pattern.test(part) ? (
				// biome-ignore lint/suspicious/noArrayIndexKey: pure presentational split
				<span key={i} className="text-amber-300 font-bold bg-amber-400/20 rounded-xs px-0.5">
					{part}
				</span>
			) : (
				part
			),
		);
	} catch {
		return text;
	}
}

export function EverythingWidget({ settings }: { settings: Record<string, unknown> }) {
	const t = useT();
	const island = useIsland();
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	const port = Number(settings.httpPort || 8080);
	const [query, setQuery] = useState("");
	const [activeFilter, setActiveFilter] = useState<FilterType>("all");
	const [items, setItems] = useState<EverythingItem[]>([]);
	const [totalResults, setTotalResults] = useState(0);
	const [isConnected, setIsConnected] = useState(true);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [showHelp, setShowHelp] = useState(false);
	const [sortKey, setSortKey] = useState<SortKey>("date_modified");
	const [sortAscending, setSortAscending] = useState(false);
	const [copiedPath, setCopiedPath] = useState<string | null>(null);

	useEffect(() => {
		return () => {
			island.keepOpen(false, "everything");
		};
	}, [island]);

	// Build effective Everything query string with filters
	const buildSearchQuery = useCallback(() => {
		const filterObj = FILTERS.find((f) => f.id === activeFilter);
		const prefix = filterObj?.prefix || "";
		const q = query.trim();
		if (prefix && q) return `${prefix} ${q}`;
		if (prefix) return prefix;
		return q;
	}, [activeFilter, query]);

	useEffect(() => {
		let active = true;
		const effectiveQuery = buildSearchQuery();
		queryEverything(effectiveQuery, port, 18, sortKey, sortAscending).then((res) => {
			if (!active) return;
			setIsConnected(res.ok);
			setItems(res.items);
			setTotalResults(res.total);
			setSelectedIndex(0);
		});
		return () => {
			active = false;
		};
	}, [buildSearchQuery, port, sortKey, sortAscending]);

	const getItemFullPath = (item: EverythingItem): string => {
		if (!item.path) return item.name;
		if (item.path.endsWith("\\") || item.path.endsWith("/")) {
			return `${item.path}${item.name}`;
		}
		return `${item.path}\\${item.name}`;
	};

	const openItem = (item: EverythingItem, e?: React.MouseEvent) => {
		e?.stopPropagation();
		const fullPath = getItemFullPath(item);
		openExternal(fullPath);
	};

	const openFolder = (item: EverythingItem, e?: React.MouseEvent) => {
		e?.stopPropagation();
		const fullPath = getItemFullPath(item);
		openInFolder(fullPath);
	};

	const copyItemPath = (item: EverythingItem, e?: React.MouseEvent) => {
		e?.stopPropagation();
		const fullPath = getItemFullPath(item);
		if (navigator.clipboard) {
			navigator.clipboard.writeText(fullPath);
		}
		setCopiedPath(fullPath);
		setTimeout(() => setCopiedPath(null), 1800);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			e.stopPropagation();
			setSelectedIndex((prev) => {
				const next = items.length ? (prev + 1) % items.length : 0;
				scrollItemIntoView(next);
				return next;
			});
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			e.stopPropagation();
			setSelectedIndex((prev) => {
				const next = items.length ? (prev - 1 + items.length) % items.length : 0;
				scrollItemIntoView(next);
				return next;
			});
		} else if (e.key === "Enter") {
			e.preventDefault();
			e.stopPropagation();
			if (items[selectedIndex]) {
				if (e.shiftKey) {
					openFolder(items[selectedIndex]);
				} else {
					openItem(items[selectedIndex]);
				}
			}
		} else if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			if (query) {
				setQuery("");
			} else {
				inputRef.current?.blur();
				island.keepOpen(false, "everything");
			}
		}
	};

	const scrollItemIntoView = (index: number) => {
		const container = listRef.current;
		if (!container) return;
		const row = container.children[index] as HTMLElement | undefined;
		if (row) {
			row.scrollIntoView({ block: "nearest" });
		}
	};

	const toggleSort = (key: SortKey) => {
		if (sortKey === key) {
			setSortAscending(!sortAscending);
		} else {
			setSortKey(key);
			setSortAscending(key === "name" || key === "path");
		}
	};

	return (
		<div className="flex h-full flex-col justify-between gap-1.5 px-1 select-none text-text">
			{/* Top Bar: Search Bar with Input Protection & Connection Badge */}
			<div className="flex items-center gap-2 border-b border-white/8 pb-1.5">
				<form
					onSubmit={(e) => e.preventDefault()}
					className="flex flex-1 items-center gap-2 rounded-xl bg-white/6 px-3 py-1 border border-white/8 focus-within:border-amber-400/60 focus-within:bg-white/10 transition-all"
					data-no-drag
				>
					<SearchIcon size={15} className="text-amber-400 shrink-0" />
					<input
						ref={inputRef}
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onFocus={() => island.keepOpen(true, "everything")}
						onBlur={() => island.keepOpen(false, "everything")}
						onMouseDown={() => {
							island.keepOpen(true, "everything");
							command("focus_island");
						}}
						onKeyDown={handleKeyDown}
						placeholder={t("marketplace.widgets.everything.placeholder")}
						className="min-w-0 flex-1 bg-transparent text-xs text-text placeholder:text-text-faint focus:outline-none"
					/>
					{query && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								setQuery("");
								inputRef.current?.focus();
							}}
							className="rounded-full p-0.5 text-text-faint hover:text-text cursor-pointer"
						>
							<XIcon size={13} />
						</button>
					)}
				</form>

				{/* Everything Status & Diagnostic Pill */}
				<motion.button
					type="button"
					whileHover={{ scale: 1.04 }}
					whileTap={{ scale: 0.96 }}
					onClick={(e) => {
						e.stopPropagation();
						setShowHelp(!showHelp);
					}}
					className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-medium border transition-colors shrink-0 cursor-pointer ${
						isConnected
							? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
							: "bg-amber-500/15 text-amber-400 border-amber-500/25"
					}`}
				>
					<span className={`size-1.5 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
					<span className="font-mono">{isConnected ? `HTTP :${port}` : "离线"}</span>
					<HelpCircleIcon size={11} className="opacity-70" />
				</motion.button>
			</div>

			{/* Filter Tabs Bar (Authentic Everything filter presets) */}
			<div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
				{FILTERS.map((f) => {
					const isActive = activeFilter === f.id;
					return (
						<button
							key={f.id}
							type="button"
							onClick={() => setActiveFilter(f.id)}
							className={`rounded-lg px-2.5 py-0.8 text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer border ${
								isActive
									? "bg-amber-500/20 text-amber-300 border-amber-500/35 shadow-xs"
									: "bg-white/4 text-text-faint border-transparent hover:bg-white/8 hover:text-text"
							}`}
						>
							{f.label}
						</button>
					);
				})}
			</div>

			{/* Inline Quick Help Drawer when HTTP server is offline */}
			<AnimatePresence>
				{showHelp && (
					<motion.div
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: "auto" }}
						exit={{ opacity: 0, height: 0 }}
						className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-[11px] text-amber-200"
					>
						<p>{t("marketplace.widgets.everything.helpGuide", { port })}</p>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Table Header Row (Name, Path, Size, Date Modified) */}
			<div className="grid grid-cols-12 gap-2 px-2.5 py-1 text-[10.5px] font-semibold text-text-faint border-b border-white/5 bg-white/2 rounded-md">
				<button
					type="button"
					onClick={() => toggleSort("name")}
					className="col-span-5 flex items-center gap-1 text-left hover:text-text cursor-pointer"
				>
					<span>名称</span>
					{sortKey === "name" && <ArrowDownUpIcon size={10} className="text-amber-400" />}
				</button>
				<button
					type="button"
					onClick={() => toggleSort("path")}
					className="col-span-4 flex items-center gap-1 text-left hover:text-text cursor-pointer"
				>
					<span>路径</span>
					{sortKey === "path" && <ArrowDownUpIcon size={10} className="text-amber-400" />}
				</button>
				<button
					type="button"
					onClick={() => toggleSort("size")}
					className="col-span-1 text-right hover:text-text cursor-pointer"
				>
					<span>大小</span>
				</button>
				<button
					type="button"
					onClick={() => toggleSort("date_modified")}
					className="col-span-2 text-right hover:text-text cursor-pointer"
				>
					<span>修改时间</span>
				</button>
			</div>

			{/* Results List: Authentic Everything Scrollable Table */}
			<div
				ref={listRef}
				className="flex-1 min-h-[170px] max-h-[190px] overflow-y-auto no-scrollbar flex flex-col gap-0.5"
				data-scroll
			>
				{items.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-6 text-center text-xs text-text-faint">
						{!isConnected ? (
							<div className="flex flex-col items-center gap-1 max-w-md">
								<span className="text-amber-300 font-medium">Everything 本地 HTTP 服务未开启</span>
								<span className="text-[11px] text-text-dim">
									请在 Everything 中打开：【工具】→【选项】→【HTTP 服务器】→ 勾选【启用 HTTP 服务器】（端口 8080）。
								</span>
							</div>
						) : (
							<div className="flex flex-col items-center gap-1">
								<SearchIcon size={20} className="text-text-faint/40 mb-1" />
								<span>{query ? "未检索到匹配的文件或文件夹" : "Everything 已就绪，输入关键字即时秒级检索"}</span>
								<span className="text-[10px] text-text-faint font-mono">
									支持搜索语法：ext:md、*.pdf、folder\file、*.png 等
								</span>
							</div>
						)}
					</div>
				) : (
					items.map((item, index) => {
						const isSelected = index === selectedIndex;
						const fullPath = getItemFullPath(item);
						const isFolder = item.type === "folder";

						return (
							<div
								key={fullPath}
								onClick={(e) => openItem(item, e)}
								onMouseEnter={() => setSelectedIndex(index)}
								className={`group grid grid-cols-12 gap-2 items-center rounded-lg px-2.5 py-1 text-xs transition-colors cursor-pointer border ${
									isSelected
										? "bg-amber-400/15 border-amber-400/50 text-white shadow-xs"
										: "bg-white/2 border-transparent hover:bg-white/5 hover:border-white/10"
								}`}
							>
								{/* Col 1: Icon + Name + Matched Highlight (5 cols) */}
								<div className="col-span-5 flex items-center gap-2 min-w-0 pr-1">
									{getFileIcon(item.name, item.type)}
									<span className="truncate font-medium text-[11.5px] text-text" title={fullPath}>
										{highlightMatch(item.name, query)}
									</span>
								</div>

								{/* Col 2: Folder Path (4 cols) */}
								<div className="col-span-4 min-w-0 pr-1 flex items-center">
									<span
										className="truncate text-[10.5px] text-text-faint font-mono hover:underline hover:text-amber-300"
										title={item.path}
										onClick={(e) => openFolder(item, e)}
									>
										{item.path}
									</span>
								</div>

								{/* Col 3: Size (1 col) */}
								<div className="col-span-1 text-right font-mono text-[10px] text-text-faint whitespace-nowrap">
									{isFolder ? "文件夹" : formatFileSize(item.size)}
								</div>

								{/* Col 4: Modified Time + Action Buttons (2 cols) */}
								<div className="col-span-2 flex items-center justify-end gap-1.5 min-w-0">
									<span className="truncate font-mono text-[9.5px] text-text-faint group-hover:hidden">
										{formatEverythingDate(item.date_modified)}
									</span>
									<div className="hidden group-hover:flex items-center gap-1 shrink-0">
										<button
											type="button"
											title="打开文件 (Enter)"
											onClick={(e) => openItem(item, e)}
											className="rounded-md p-1 text-text-faint hover:text-amber-300 hover:bg-white/10 transition-colors"
										>
											<ExternalLinkIcon size={11} />
										</button>
										<button
											type="button"
											title="在资源管理器中定位 (Shift+Enter)"
											onClick={(e) => openFolder(item, e)}
											className="rounded-md p-1 text-text-faint hover:text-amber-300 hover:bg-white/10 transition-colors"
										>
											<FolderOpenIcon size={11} />
										</button>
										<button
											type="button"
											title="复制完整路径"
											onClick={(e) => copyItemPath(item, e)}
											className="rounded-md p-1 text-text-faint hover:text-amber-300 hover:bg-white/10 transition-colors"
										>
											{copiedPath === fullPath ? (
												<CheckIcon size={11} className="text-emerald-400" />
											) : (
												<CopyIcon size={11} />
											)}
										</button>
									</div>
								</div>
							</div>
						);
					})
				)}
			</div>

			{/* Footer: Original Everything Status Bar & Shortcut Reference */}
			<div className="flex items-center justify-between text-[10px] text-text-faint pt-1 border-t border-white/8 font-mono">
				<div className="flex items-center gap-2">
					<span>
						已找到 {items.length} 个对象
						{totalResults > 0 && ` (总计 ${totalResults.toLocaleString()} 个)`}
					</span>
					{copiedPath && <span className="text-emerald-400 font-sans">✓ 路径已复制到剪贴板</span>}
				</div>
				<div className="flex items-center gap-3">
					<span className="hidden sm:inline opacity-70">回车打开 · Shift+回车定位文件夹</span>
					<span className="text-amber-400/80">Everything</span>
				</div>
			</div>
		</div>
	);
}

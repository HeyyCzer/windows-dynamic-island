import { CheckCircle2Icon, CircleIcon, PlusIcon, StickyNoteIcon, Trash2Icon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { command } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { useIsland } from "../../../core/island";

interface MemoItem {
	id: string;
	text: string;
	done: boolean;
}

const STORAGE_KEY = "island_memo_items";

function loadMemos(): MemoItem[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return JSON.parse(raw);
	} catch {
		// fallback
	}
	return [
		{ id: "1", text: "PR: Implement Apple HIG Dynamic Island specs", done: false },
		{ id: "2", text: "Weekly product review and i18n adaptation", done: true },
		{ id: "3", text: "Buy fresh coffee beans and fruit", done: false },
	];
}

export function QuickMemoWidget({ settings: _settings }: { settings: Record<string, unknown> }) {
	const t = useT();
	const island = useIsland();
	const inputRef = useRef<HTMLInputElement>(null);
	const [memos, setMemos] = useState<MemoItem[]>(loadMemos);
	const [newText, setNewText] = useState("");

	useEffect(() => {
		return () => {
			island.keepOpen(false, "memo");
		};
	}, [island]);

	const saveMemos = (next: MemoItem[]) => {
		setMemos(next);
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		} catch {
			// ignore
		}
	};

	const toggleDone = (id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		const next = memos.map((m) => (m.id === id ? { ...m, done: !m.done } : m));
		saveMemos(next);
	};

	const handleDelete = (id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		const next = memos.filter((m) => m.id !== id);
		saveMemos(next);
	};

	const handleAdd = (e: React.FormEvent | React.KeyboardEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (!newText.trim()) return;
		const newItem = { id: String(Date.now()), text: newText.trim(), done: false };
		const next = [newItem, ...memos.slice(0, 2)];
		saveMemos(next);
		setNewText("");
	};

	const pendingCount = memos.filter((m) => !m.done).length;

	return (
		<div className="flex h-full flex-col justify-center gap-2 px-1 select-none">
			{/* Top Bar: Title & Inline Add Input */}
			<div className="flex items-center justify-between border-b border-white/8 pb-1.5">
				<div className="flex items-center gap-2.5 min-w-0">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-amber-400/18 text-amber-300">
						<StickyNoteIcon size={18} />
					</div>
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<span className="text-[13px] font-semibold text-text whitespace-nowrap">
								{t("marketplace.widgets.memo.title")}
							</span>
							<span className="rounded-full bg-amber-400/18 px-2 py-0.2 text-[10.5px] font-medium text-amber-300 shrink-0 whitespace-nowrap">
								{t("marketplace.widgets.memo.pending", { n: pendingCount })}
							</span>
						</div>
						<p className="text-[11px] text-text-faint truncate">{t("marketplace.widgets.memo.subtitle")}</p>
					</div>
				</div>

				<form onSubmit={handleAdd} className="flex items-center gap-1.5 shrink-0 ml-3" data-no-drag>
					<input
						ref={inputRef}
						type="text"
						value={newText}
						onChange={(e) => setNewText(e.target.value)}
						onFocus={() => {
							island.keepOpen(true, "memo");
						}}
						onBlur={() => {
							island.keepOpen(false, "memo");
						}}
						onMouseDown={() => {
							island.keepOpen(true, "memo");
							command("focus_island");
						}}
						onKeyDown={(e) => {
							e.stopPropagation();
							if (e.key === "Escape") {
								inputRef.current?.blur();
								island.keepOpen(false, "memo");
							}
						}}
						placeholder={t("marketplace.widgets.memo.placeholder")}
						className="h-8 w-44 rounded-full border border-white/10 bg-white/6 px-3 text-xs text-text placeholder:text-text-faint focus:border-white/25 focus:outline-none transition-colors"
					/>
					<motion.button
						type="submit"
						disabled={!newText.trim()}
						whileHover={{ scale: 1.08 }}
						whileTap={{ scale: 0.88 }}
						transition={{ type: "spring", stiffness: 500, damping: 25 }}
						className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-400 text-neutral-900 transition-opacity hover:bg-amber-300 active:scale-95 disabled:opacity-40"
					>
						<PlusIcon size={14} />
					</motion.button>
				</form>
			</div>

			{/* Parallel 3-Item Memo Checklist with Spring Layout Morphing */}
			<div className="flex flex-col gap-1.5 pt-0.5">
				{memos.length === 0 ? (
					<div className="py-4 text-center text-xs text-text-faint">{t("marketplace.widgets.memo.empty")}</div>
				) : (
					<AnimatePresence initial={false}>
						{memos.slice(0, 3).map((item) => (
							<motion.div
								key={item.id}
								layout
								initial={{ opacity: 0, y: -8, scale: 0.95 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={{ opacity: 0, scale: 0.9, height: 0 }}
								transition={{ type: "spring", stiffness: 420, damping: 30 }}
								className="group flex items-center justify-between rounded-xl border border-white/5 bg-white/3 px-3 py-1.5 transition-colors hover:border-white/12 hover:bg-white/6"
							>
								<div className="flex items-center gap-2.5 min-w-0">
									<motion.button
										type="button"
										whileHover={{ scale: 1.15 }}
										whileTap={{ scale: 0.85 }}
										transition={{ type: "spring", stiffness: 500, damping: 25 }}
										onClick={(e) => toggleDone(item.id, e)}
										className="text-text-faint hover:text-emerald-400 transition-colors shrink-0"
									>
										{item.done ? <CheckCircle2Icon size={16} className="text-emerald-400" /> : <CircleIcon size={16} />}
									</motion.button>
									<span
										className={`truncate text-xs font-medium transition-all ${
											item.done ? "text-text-faint line-through opacity-60" : "text-text"
										}`}
									>
										{item.text}
									</span>
								</div>

								<motion.button
									type="button"
									title="Delete"
									whileHover={{ scale: 1.15 }}
									whileTap={{ scale: 0.85 }}
									transition={{ type: "spring", stiffness: 500, damping: 25 }}
									onClick={(e) => handleDelete(item.id, e)}
									className="rounded p-1 text-text-faint opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100 shrink-0 ml-2"
								>
									<Trash2Icon size={12} />
								</motion.button>
							</motion.div>
						))}
					</AnimatePresence>
				)}
			</div>
		</div>
	);
}

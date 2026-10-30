import { type PointerEvent, useRef } from "react";
import { Glyph } from "../../../components/Glyph";
import { providerAction } from "../../../core/bridge";
import { cn } from "../../../core/cn";
import { useT } from "../../../core/i18n";
import { draggingFiles, useIsland } from "../../../core/island";
import { attachFiles, requestAskFocus, useAskEnabled } from "../../ask/store";
import { SHELF_PROVIDER, type ShelfItem, type ShelfState, shelfAction } from "../actions";

const DRAG_THRESHOLD = 5;

/** Files dropped on the island; drag them out to any app, double-click to open. */
export function ShelfPanel({ state }: { state: ShelfState | undefined }) {
	const t = useT();
	const dragging = draggingFiles.use();
	const items = state?.items ?? [];

	return (
		<div className="flex h-full flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
			<div className="flex items-center justify-between gap-3">
				<span className="text-[12px] text-text-dim">{items.length ? t("shelf.hint") : t("shelf.empty")}</span>
				{items.length > 0 && (
					<button
						type="button"
						className="flex-none rounded-[10px] px-2.5 py-0.5 text-[12px] text-text-dim hover:bg-white/10 hover:text-text"
						onClick={() => providerAction(SHELF_PROVIDER, "clear")}
					>
						{t("shelf.clear")}
					</button>
				)}
			</div>
			<div
				className={cn(
					"flex min-h-0 flex-1 flex-wrap content-start gap-1 overflow-y-auto rounded-[14px] transition-[background,box-shadow] duration-200 [scrollbar-width:none]",
					dragging && "bg-[rgba(100,210,255,0.06)] shadow-[inset_0_0_0_1.5px_rgba(100,210,255,0.45)]",
				)}
				data-scroll
			>
				{items.map((item) => (
					<Tile key={item.path} item={item} />
				))}
				{!items.length && (
					<div className="m-auto flex flex-col items-center gap-1.5 text-[12.5px] text-text-dim">
						<Glyph name="download" size={22} />
						<span>{t("shelf.drop")}</span>
					</div>
				)}
			</div>
		</div>
	);
}

function Tile({ item }: { item: ShelfItem }) {
	const t = useT();
	const island = useIsland();
	const askEnabled = useAskEnabled();
	const press = useRef<{ x: number; y: number; id: number } | null>(null);

	// Drag it out to any app (Explorer, WhatsApp, an e-mail…): the OS takes
	// over the drag once the pointer has moved a little with the button down.
	const onPointerDown = (e: PointerEvent) => {
		if (e.button !== 0 || (e.target as Element).closest("button")) return;
		e.stopPropagation();
		press.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
	};
	const onPointerMove = (e: PointerEvent) => {
		const p = press.current;
		if (!p || p.id !== e.pointerId || (e.buttons & 1) === 0) return;
		if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return;
		press.current = null;
		shelfAction("drag", item.path);
	};

	return (
		<div
			className="group relative flex h-23 w-24 cursor-grab flex-col items-center justify-center gap-1.5 rounded-xl hover:bg-white/10"
			title={item.path}
			data-no-drag
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={() => (press.current = null)}
			onDoubleClick={() => shelfAction("open", item.path)}
		>
			<div className={cn("grid size-11 place-items-center", item.thumb && "w-15")}>
				{item.thumb ? (
					<img src={item.thumb} alt="" className="h-11 w-15 rounded-md object-cover" draggable={false} />
				) : (
					<FileIcon item={item} />
				)}
			</div>
			<span className="line-clamp-2 max-w-22 text-center text-[11px]/[1.25] wrap-break-word">{item.name}</span>
			{askEnabled && (
				<button
					type="button"
					className="absolute top-1 hidden size-5 place-items-center rounded-full bg-[#3a3a3c] text-[13px] leading-none group-hover:grid hover:bg-[#4a4a4e] left-1"
					title={t("shelf.ask")}
					onClick={() => {
						attachFiles([item.path]);
						requestAskFocus();
						island.expand("ask");
					}}
				>
					<Glyph name="chat" size={10} />
				</button>
			)}
			<button
				type="button"
				className="absolute top-1 hidden size-5 place-items-center rounded-full bg-[#3a3a3c] text-[13px] leading-none group-hover:grid hover:bg-[#4a4a4e] right-1"
				title={t("shelf.remove")}
				onClick={() => shelfAction("remove", item.path)}
			>
				×
			</button>
		</div>
	);
}

/** A generic document / folder icon with the extension on it. */
function FileIcon({ item }: { item: ShelfItem }) {
	if (item.isDir) return <Glyph name="folder" size={30} color="#64D2FF" />;
	return (
		<span className="relative h-10.5 w-8.5 rounded-[4px_12px_4px_4px] bg-[linear-gradient(160deg,#e9e9ee,#b9b9c2)]">
			<span className="absolute inset-x-0.75 bottom-1.25 rounded-[3px] bg-[#0a84ff] py-px text-center text-[8.5px] font-[750] text-white uppercase">
				{item.ext.slice(0, 4) || "?"}
			</span>
		</span>
	);
}

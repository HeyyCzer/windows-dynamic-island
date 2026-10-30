import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { useT } from "../../core/i18n";
import type { ModuleEntry } from "../../core/types";

/** Launcher grid: tiles per row, tile height and gap (px). */
const LAUNCHER_COLS = 4;
const TILE_H = 62;
const TILE_GAP = 8;

export function launcherSize(count: number) {
	const rows = Math.max(1, Math.ceil(count / LAUNCHER_COLS));
	return { width: 560, height: 32 + rows * TILE_H + (rows - 1) * TILE_GAP };
}

/** Every enabled module as a grid of tiles, in the chosen order. */
export function Launcher({ entries, onSelect }: { entries: ModuleEntry[]; onSelect: (id: string) => void }) {
	const t = useT();
	return (
		<div
			className="grid h-full"
			style={{ gridTemplateColumns: `repeat(${LAUNCHER_COLS}, 1fr)`, gridAutoRows: TILE_H, gap: TILE_GAP }}
		>
			{entries.map(({ module, view }, i) => (
				<motion.button
					key={module.id}
					className="relative flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/5 px-2 text-text-dim shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)] transition-[background,color,box-shadow] duration-200 hover:bg-white/10 hover:text-text hover:shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--tab-accent)_55%,transparent)]"
					style={{ "--tab-accent": view.accent ?? "#fff" } as CSSProperties}
					initial={{ opacity: 0, scale: 0.92 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ delay: 0.03 * i, type: "spring", stiffness: 420, damping: 28 }}
					onClick={(e) => {
						e.stopPropagation();
						onSelect(module.id);
					}}
				>
					<span className="grid h-5 place-items-center">{view.icon}</span>
					<span className="max-w-full truncate text-[11.5px] font-semibold">{t(module.title)}</span>
					{view.active && <span className="absolute top-2.25 right-2.25 size-1.25 rounded-full bg-ok" />}
				</motion.button>
			))}
		</div>
	);
}

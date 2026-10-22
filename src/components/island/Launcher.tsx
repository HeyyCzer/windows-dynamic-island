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
		<div className="launcher" style={{ "--launcher-cols": LAUNCHER_COLS, "--tile-h": `${TILE_H}px`, "--tile-gap": `${TILE_GAP}px` } as CSSProperties}>
			{entries.map(({ module, view }, i) => (
				<motion.button
					key={module.id}
					className="launcher-tile"
					style={{ "--tab-accent": view.accent ?? "#fff" } as CSSProperties}
					initial={{ opacity: 0, scale: 0.92 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ delay: 0.03 * i, type: "spring", stiffness: 420, damping: 28 }}
					onClick={(e) => {
						e.stopPropagation();
						onSelect(module.id);
					}}
				>
					<span className="launcher-icon">{view.icon}</span>
					<span className="launcher-name">{t(module.title)}</span>
					{view.active && <span className="tab-dot launcher-dot" />}
				</motion.button>
			))}
		</div>
	);
}

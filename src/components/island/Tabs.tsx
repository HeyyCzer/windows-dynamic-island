import { motion, type Transition } from "motion/react";
import type { CSSProperties } from "react";
import { command } from "../../core/bridge";
import { useT } from "../../core/i18n";
import type { ModuleEntry } from "../../core/types";
import { LAUNCHER } from "../../core/useIslandController";
import { GearIcon, GridIcon } from "../icons";

export function Tabs({
	entries,
	current,
	onSelect,
	iconsOnly,
	transition,
}: {
	entries: ModuleEntry[];
	current: string | null;
	onSelect: (id: string) => void;
	iconsOnly: boolean;
	transition: Transition;
}) {
	const t = useT();
	const pill = <motion.span layoutId="tab-pill" className="tab-pill" transition={transition} />;
	return (
		<div className={`tabs ${iconsOnly ? "icons-only" : ""}`}>
			{entries.map(({ module, view }) => {
				const selected = current === module.id;
				return (
					<button
						key={module.id}
						className={`tab ${selected ? "is-active" : ""}`}
						title={t(module.title)}
						style={{ "--tab-accent": view.accent ?? "#fff" } as CSSProperties}
						onClick={() => onSelect(module.id)}
					>
						{selected && pill}
						<span className="tab-icon">{view.icon}</span>
						{/* Many modules: only the open tab spells out its name. */}
						{!iconsOnly && selected && <span className="tab-label">{t(module.title)}</span>}
						{view.active && !selected && <span className="tab-dot" />}
					</button>
				);
			})}
			<button
				className={`tab tab-launcher ${current === LAUNCHER ? "is-active" : ""}`}
				title={t("layout.launcher")}
				onClick={(e) => {
					e.stopPropagation();
					onSelect(LAUNCHER);
				}}
			>
				{current === LAUNCHER && pill}
				<span className="tab-icon">
					<GridIcon size={14} />
				</span>
			</button>
			<motion.button
				className="tab-gear"
				title={t("island.settings")}
				whileHover={{ rotate: 45 }}
				whileTap={{ scale: 0.85 }}
				transition={{ type: "spring", stiffness: 300, damping: 15 }}
				onClick={(e) => {
					e.stopPropagation();
					command("open_settings");
				}}
			>
				<GearIcon size={16} />
			</motion.button>
		</div>
	);
}

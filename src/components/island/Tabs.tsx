import { motion, type Transition } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { tv } from "tailwind-variants";
import { command } from "../../core/bridge";
import { useT } from "../../core/i18n";
import type { ModuleEntry } from "../../core/types";
import { LAUNCHER } from "../../core/useIslandController";
import { GearIcon, GridIcon } from "../icons";

const tabs = tv({
	slots: {
		base: "mb-2.5 flex gap-1",
		tab: "relative flex h-7.5 items-center gap-1.75 rounded-[15px] pr-3 pl-2 text-[13px] font-semibold text-text-dim transition-colors duration-200 hover:text-text",
		pill: "absolute inset-0 rounded-[inherit] bg-white/10",
		part: "relative grid place-items-center",
		dot: "relative size-1.25 rounded-full bg-ok",
		extra: "ml-auto flex items-center gap-1.5",
		gear: "grid size-7.5 place-items-center rounded-full text-text-faint transition-colors duration-200 hover:bg-white/8 hover:text-text",
	},
	variants: {
		active: { true: { tab: "text-text" } },
		/** The launcher's grid button, pushed right with the gear. */
		launcher: { true: { tab: "ml-auto w-7.5 justify-center p-0" } },
		/** Windows Island: round icon tabs, ringed in the module's color. */
		iconsOnly: {
			true: {
				tab: "w-8 justify-center rounded-full p-0 opacity-55 transition-opacity hover:opacity-100",
				pill: "shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--tab-accent)_70%,transparent)]",
				dot: "absolute top-0.75 right-0.75 shadow-[0_0_0_1.5px_#000]",
			},
		},
		bottom: {
			true: { base: "m-0 mt-2 justify-center", extra: "ml-1.5", gear: "ml-1.5" },
		},
	},
	compoundVariants: [
		{ iconsOnly: true, active: true, class: { tab: "opacity-100" } },
		{ iconsOnly: true, launcher: true, class: { tab: "ml-1.5 w-8 [--tab-accent:#fff]" } },
	],
});

export function Tabs({
	entries,
	current,
	onSelect,
	iconsOnly,
	bottom,
	transition,
	extra,
}: {
	entries: ModuleEntry[];
	current: string | null;
	onSelect: (id: string) => void;
	iconsOnly: boolean;
	/** Below the content (Windows Island): centered. */
	bottom: boolean;
	transition: Transition;
	/** The open module's `tabBarExtra`, shown next to the gear. */
	extra?: ReactNode;
}) {
	const t = useT();
	const s = tabs({ iconsOnly, bottom });
	const pill = <motion.span layoutId="tab-pill" className={s.pill()} transition={transition} />;
	return (
		<div className={s.base()}>
			{entries.map(({ module, view }) => {
				const selected = current === module.id;
				return (
					<button
						type="button"
						key={module.id}
						className={s.tab({ active: selected })}
						title={t(module.title)}
						style={{ "--tab-accent": view.accent ?? "#fff" } as CSSProperties}
						onClick={() => onSelect(module.id)}
					>
						{selected && pill}
						<span className={s.part()}>{view.icon}</span>
						{/* Many modules: only the open tab spells out its name. */}
						{!iconsOnly && selected && <span className={s.part()}>{t(module.title)}</span>}
						{view.active && !selected && <span className={s.dot()} />}
					</button>
				);
			})}
			<button
				type="button"
				className={s.tab({ active: current === LAUNCHER, launcher: true })}
				title={t("layout.launcher")}
				onClick={(e) => {
					e.stopPropagation();
					onSelect(LAUNCHER);
				}}
			>
				{current === LAUNCHER && pill}
				<span className={s.part()}>
					<GridIcon size={14} />
				</span>
			</button>
			{/* Sliders inside: pressing them must not drag the island. */}
			{extra && (
				<div className={s.extra()} data-no-drag>
					{extra}
				</div>
			)}
			<motion.button
				className={s.gear()}
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

import { LayoutGridIcon, PinIcon, SettingsIcon } from "lucide-react";
import { motion, type Transition } from "motion/react";
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { tv } from "tailwind-variants";
import { command } from "../../core/bridge";
import { useT } from "../../core/i18n";
import type { ModuleEntry } from "../../core/types";
import { LAUNCHER } from "../../core/useIslandController";
import { MAX_VISIBLE_TABS, tabWindow } from "./tabWindow";

/** How much of the next tab shows, cut off, past an edge that hides more tabs. */
const PEEK = 14;
/** How far the edge fade reaches into the strip. */
const FADE = 24;

/** Fades the strip's clipped edges out, so the tabs never butt into the buttons beside them. */
function edgeMask(left: boolean, right: boolean) {
	if (!left && !right) return undefined;
	const from = left ? `transparent 0, #000 ${FADE}px` : "#000 0";
	const to = right ? `#000 calc(100% - ${FADE}px), transparent 100%` : "#000 100%";
	return `linear-gradient(to right, ${from}, ${to})`;
}

const tabs = tv({
	slots: {
		/** Room on the right for the pin, which sits apart from the tabs at the far edge. */
		base: "relative mb-2.5 flex gap-1 pr-9.5",
		/** Clips the module tabs to the window on show (see `tabWindow`); shrinks before it overlaps the buttons. */
		clip: "relative min-w-0 overflow-hidden",
		/** Every module tab in one row, slid so the window's first tab sits at the left edge. */
		row: "relative flex w-max gap-1",
		tab: "relative flex h-7.5 shrink-0 items-center whitespace-nowrap gap-1.75 rounded-[15px] pr-3 pl-2 text-[13px] font-semibold text-text-dim transition-colors duration-200 hover:text-text",
		pill: "absolute inset-0 rounded-[inherit] bg-white/10",
		part: "relative grid place-items-center",
		label: "relative max-w-32 truncate",
		dot: "relative size-1.25 rounded-full bg-ok",
		extra: "ml-auto flex items-center gap-1.5",
		gear: "grid size-7.5 place-items-center rounded-full text-text-faint transition-colors duration-200 hover:bg-white/8 hover:text-text",
		pin: "absolute top-1/2 right-0 grid size-7.5 -translate-y-1/2 place-items-center rounded-full text-text-faint transition-colors duration-200 hover:bg-white/8 hover:text-text",
	},
	variants: {
		active: { true: { tab: "text-text" } },
		pinned: { true: { pin: "bg-white/10 text-text" } },
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
			true: { base: "m-0 mt-2 justify-center px-9.5", extra: "ml-1.5", gear: "ml-1.5" },
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
	pinned,
	onPin,
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
	/** Kept open whatever the pointer does; the pin button sits at the far right. */
	pinned: boolean;
	onPin: (pinned: boolean) => void;
}) {
	const t = useT();
	const s = tabs({ iconsOnly, bottom });
	const pill = <motion.span layoutId="tab-pill" className={s.pill()} transition={transition} />;

	// Too many modules: show a window of them that slides along with the selection.
	const selectedIndex = entries.findIndex((e) => e.module.id === current);
	const [win, setWin] = useState(() => ({ start: tabWindow(0, entries.length, selectedIndex), current }));
	const start = tabWindow(win.start, entries.length, win.current === current ? -1 : selectedIndex);
	if (start !== win.start || win.current !== current) setWin({ start, current });
	const end = Math.min(start + MAX_VISIBLE_TABS, entries.length);
	const hiddenLeft = start > 0;
	const hiddenRight = end < entries.length;

	// Where the window sits in the row, measured: the open tab is wider (its name shows).
	const clipRef = useRef<HTMLDivElement>(null);
	const rowRef = useRef<HTMLDivElement>(null);
	const [frame, setFrame] = useState<{ left: number; width: number } | null>(null);
	useLayoutEffect(() => {
		const items = rowRef.current?.children;
		const first = items?.[start] as HTMLElement | undefined;
		const last = items?.[end - 1] as HTMLElement | undefined;
		if (!first || !last) return setFrame(null);
		const left = hiddenLeft ? first.offsetLeft - PEEK : 0;
		const width = last.offsetLeft + last.offsetWidth + (hiddenRight ? PEEK : 0) - left;
		setFrame((f) => (f?.left === left && f.width === width ? f : { left, width }));
	});

	// Squeezed by the buttons beside it (a wide `extra`, a narrow island): clip and fade the right edge too.
	const [squeezed, setSqueezed] = useState(false);
	const target = frame?.width;
	useEffect(() => {
		const clip = clipRef.current;
		if (!clip || target === undefined) return;
		const check = () => setSqueezed(clip.clientWidth + 0.5 < target);
		check();
		const observer = new ResizeObserver(check);
		observer.observe(clip);
		return () => observer.disconnect();
	}, [target]);

	return (
		<div className={s.base()}>
			<div
				ref={clipRef}
				className={s.clip()}
				style={{ width: frame?.width, maskImage: edgeMask(hiddenLeft, hiddenRight || squeezed) }}
			>
				<motion.div
					ref={rowRef}
					className={s.row()}
					initial={false}
					animate={{ x: -(frame?.left ?? 0) }}
					transition={transition}
				>
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
								{!iconsOnly && selected && <span className={s.label()}>{t(module.title)}</span>}
								{view.active && !selected && <span className={s.dot()} />}
							</button>
						);
					})}
				</motion.div>
			</div>
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
					<LayoutGridIcon size={14} />
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
				<SettingsIcon size={16} />
			</motion.button>
			<motion.button
				className={s.pin({ pinned })}
				title={t(pinned ? "island.unpin" : "island.pin")}
				aria-pressed={pinned}
				whileTap={{ scale: 0.85 }}
				onClick={(e) => {
					e.stopPropagation();
					onPin(!pinned);
				}}
			>
				<motion.span
					className="grid place-items-center"
					initial={false}
					animate={{ rotate: pinned ? 0 : 45 }}
					transition={{ type: "spring", stiffness: 300, damping: 18 }}
				>
					<PinIcon size={15} fill={pinned ? "currentColor" : "none"} />
				</motion.span>
			</motion.button>
		</div>
	);
}

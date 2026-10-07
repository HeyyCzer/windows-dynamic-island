import { AnimatePresence, motion, type Transition } from "motion/react";
import { useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { modules } from "../modules";
import { useHitRects } from "../core/useHitRects";
import { useIslandController, type ModuleEntry } from "../core/useIslandController";
import { useIslandDrag } from "../core/useIslandDrag";
import { useFileDrop } from "../core/useFileDrop";
import { draggingFiles, IslandContext, type IslandApi } from "../core/island";
import { rimBackground, useAppearance, type Appearance } from "../core/appearance";
import type { IslandMode } from "../core/types";
import { command, useTauriEvent } from "../core/bridge";
import { GearIcon } from "./icons";
import { useSyncLocale, useT } from "../core/i18n";
import { IdleClock } from "./IdleClock";
import { attachFiles, requestAskFocus } from "../modules/ask/store";
import { addToShelf } from "../modules/shelf/actions";

interface Geo {
	width: number;
	height: number;
	radius: number;
	ear: number;
}

/** Everything that differs between the two looks (see `IslandStyle`). */
interface Variant {
	idle: Geo;
	compact: Geo;
	expanded: Geo;
	tabBar: number;
	/** Gap between the top of the screen and the island. */
	top: number;
	tabsAtBottom: boolean;
	shellSpring: Transition;
	expandSpring: Transition;
}

/** Hangs from the top edge, notch-like, with concave ears. */
const DYNAMIC: Variant = {
	idle: { width: 150, height: 8, radius: 8, ear: 6 },
	compact: { width: 265, height: 38, radius: 19, ear: 10 },
	expanded: { width: 560, height: 190, radius: 32, ear: 14 },
	tabBar: 46,
	top: 0,
	tabsAtBottom: false,
	shellSpring: { type: "spring", stiffness: 420, damping: 34, mass: 0.9 },
	expandSpring: { type: "spring", stiffness: 330, damping: 27, mass: 0.9 },
};

/** Windows Island: a floating pill with a livelier bounce, tabs at the bottom. */
const WINDOWS: Variant = {
	idle: { width: 140, height: 34, radius: 17, ear: 0 },
	compact: { width: 265, height: 38, radius: 19, ear: 0 },
	expanded: { width: 560, height: 190, radius: 34, ear: 0 },
	tabBar: 44,
	top: 8,
	tabsAtBottom: true,
	shellSpring: { type: "spring", stiffness: 380, damping: 29, mass: 0.9 },
	expandSpring: { type: "spring", stiffness: 300, damping: 20, mass: 0.9 },
};
/** Windows Island at rest without the clock: a small, empty pill. */
const WINDOWS_BARE_IDLE: Geo = { width: 110, height: 30, radius: 15, ear: 0 };

const BUBBLE = 38;
const BUBBLE_GAP = 10;

function geometry(v: Variant, look: Appearance, mode: IslandMode, focused: ModuleEntry | undefined, primary: ModuleEntry | undefined) {
	switch (mode) {
		case "hidden":
		case "swallowed":
		case "idle":
			return look.style === "windows" && !look.idleClock ? WINDOWS_BARE_IDLE : v.idle;
		case "compact":
			return { ...v.compact, width: primary?.view.compact?.width ?? v.compact.width };
		case "peek":
		case "expanded": {
			const size = focused?.view.expandedSize ?? v.expanded;
			const extra = mode === "expanded" ? v.tabBar : 0;
			return { ...v.expanded, width: size.width, height: size.height + extra };
		}
	}
}

export function Island() {
	const ctl = useIslandController(modules);
	const { mode, primary, secondary, focused } = ctl;
	const look = useAppearance();
	const windows = look.style === "windows";
	const v = windows ? WINDOWS : DYNAMIC;
	useHitRects();
	useSyncLocale();

	const g = geometry(v, look, mode, focused, primary);
	const big = mode === "expanded" || mode === "peek";
	const hidden = mode === "hidden";
	const swallowed = mode === "swallowed";
	const resting = mode === "compact" || mode === "idle";

	const ambientCount = resting ? ctl.entries.filter((e) => e.view.ambient).length : 0;
	const drag = useIslandDrag({
		width: g.width,
		leftExtra: g.ear + (ambientCount ? BUBBLE_GAP + ambientCount * BUBBLE + (ambientCount - 1) * 8 : 0),
		rightExtra: g.ear + (mode === "compact" && secondary ? BUBBLE_GAP + BUBBLE : 0),
		canReturn: !big,
		onDragChange: ctl.lockHover,
	});

	// Files dragged over the island: the shelf opens to take them, unless
	// "Ask Claude" is open (then they become attachments).
	const live = useRef({ mode, tab: ctl.tab });
	live.current = { mode, tab: ctl.tab };
	const asking = () => live.current.mode === "expanded" && live.current.tab === "ask";
	useFileDrop({
		onEnter: () => {
			draggingFiles.set(true);
			if (!asking()) ctl.expand("shelf");
		},
		onLeave: () => draggingFiles.set(false),
		onDrop: (paths) => {
			draggingFiles.set(false);
			if (asking()) {
				attachFiles(paths);
			} else {
				addToShelf(paths);
				ctl.expand("shelf");
			}
		},
	});

	// Global shortcut: the ask page opens (controller) and its input takes the keyboard.
	useTauriEvent("island://ask", requestAskFocus);

	const api: IslandApi = useMemo(
		() => ({ mode, tab: ctl.tab, expand: ctl.expand, collapse: ctl.collapse, keepOpen: ctl.keepOpen }),
		[mode, ctl.tab, ctl.expand, ctl.collapse, ctl.keepOpen],
	);

	let contentKey: string;
	let content: ReactNode = null;
	if (mode === "compact" && primary?.view.compact) {
		contentKey = `compact:${primary.module.id}`;
		content = (
			<div className="compact">
				<div className="compact-slot">{primary.view.compact.left}</div>
				<div className="compact-slot right">{primary.view.compact.right}</div>
			</div>
		);
	} else if (big && focused) {
		contentKey = `big:${focused.module.id}`;
		const tabs = mode === "expanded" && (
			<Tabs entries={ctl.tabs} current={ctl.tab} onSelect={ctl.setTab} iconsOnly={windows} transition={v.shellSpring} />
		);
		content = (
			<div className={`expanded ${v.tabsAtBottom ? "tabs-bottom" : ""}`}>
				{!v.tabsAtBottom && tabs}
				<div className="expanded-body">{focused.view.expanded}</div>
				{v.tabsAtBottom && tabs}
			</div>
		);
	} else if (windows && look.idleClock && (mode === "idle" || swallowed)) {
		contentKey = "clock";
		content = <IdleClock />;
	} else {
		contentKey = "idle";
	}

	const radius = windows
		? { borderTopLeftRadius: g.radius, borderTopRightRadius: g.radius, borderBottomLeftRadius: g.radius, borderBottomRightRadius: g.radius }
		: { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: g.radius, borderBottomRightRadius: g.radius };
	const transition = big ? v.expandSpring : v.shellSpring;
	const rim = windows ? <Rim look={look} /> : null;

	return (
		<IslandContext.Provider value={api}>
			<div className="stage">
				{/* The tray's black hole: the island spins into its own center and comes back out. */}
				<motion.div
					className="blackhole"
					initial={false}
					animate={swallowed ? { scale: 0, rotate: -200, opacity: 0 } : { scale: 1, rotate: 0, opacity: 1 }}
					transition={
						swallowed
							? { duration: 0.46, ease: [0.55, 0, 1, 0.45] }
							: { duration: 0.56, ease: [0.34, 1.4, 0.64, 1], opacity: { duration: 0.26 } }
					}
				>
					<motion.div
						className={`shell ${windows ? "is-windows" : "is-dynamic"} ${drag.dragging ? "is-dragging" : ""}`}
						{...(hidden || swallowed ? {} : { "data-hit": true })}
						{...ctl.domHover}
						style={{ ...drag.style, marginTop: v.top }}
						onPointerDown={drag.onPointerDown}
						onClickCapture={drag.onClickCapture}
						onUpdate={drag.onShellUpdate}
						onWheel={ctl.onWheel}
						initial={false}
						animate={{
							width: g.width,
							height: g.height,
							opacity: hidden ? 0 : 1,
							y: hidden ? -g.height - 12 - v.top : 0,
						}}
						transition={transition}
						onClick={() => resting && ctl.expand()}
					>
						<motion.span className="ear left" initial={false} animate={{ width: g.ear, height: g.ear }} transition={v.shellSpring} />
						<motion.span className="ear right" initial={false} animate={{ width: g.ear, height: g.ear }} transition={v.shellSpring} />

						<motion.div
							className={`surface ${big ? "is-big" : ""}`}
							style={windows ? glowStyle(look) : undefined}
							initial={false}
							animate={radius}
							transition={transition}
						>
							<AnimatePresence mode="popLayout" initial={false}>
								<motion.div
									key={contentKey}
									className="content"
									style={{ width: g.width, height: g.height }}
									initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
									animate={{
										opacity: 1,
										scale: 1,
										filter: "blur(0px)",
										transition: { duration: 0.32, delay: 0.06, ease: [0.2, 0.9, 0.3, 1] },
									}}
									exit={{
										opacity: 0,
										scale: 0.94,
										filter: "blur(8px)",
										transition: { duration: 0.16, ease: "easeIn" },
									}}
								>
									{content}
								</motion.div>
							</AnimatePresence>
							{rim}
						</motion.div>

						<div className="ambient-bubbles">
							<AnimatePresence>
								{resting &&
									ctl.entries
										.filter((e) => e.view.ambient)
										.map(({ module, view }) => (
											<motion.button
												key={module.id}
												className="bubble ambient"
												data-hit
												layout
												initial={{ opacity: 0, scale: 0.3, x: 40 }}
												animate={{ opacity: 1, scale: mode === "idle" && !windows ? 0.84 : 1, x: 0 }}
												exit={{ opacity: 0, scale: 0.3, x: 40 }}
												transition={v.shellSpring}
												onClick={(e) => {
													e.stopPropagation();
													ctl.expand(module.id);
												}}
											>
												{view.ambient}
												{rim}
											</motion.button>
										))}
							</AnimatePresence>
						</div>

						<AnimatePresence>
							{mode === "compact" && secondary && (
								<motion.button
									key={secondary.module.id}
									className="bubble"
									data-hit
									initial={{ opacity: 0, scale: 0.3, x: -40 }}
									animate={{ opacity: 1, scale: 1, x: 0 }}
									exit={{ opacity: 0, scale: 0.3, x: -40 }}
									transition={v.shellSpring}
									onClick={(e) => {
										e.stopPropagation();
										ctl.expand(secondary.module.id);
									}}
								>
									{secondary.view.icon}
									{rim}
								</motion.button>
							)}
						</AnimatePresence>
					</motion.div>
				</motion.div>
			</div>
		</IslandContext.Provider>
	);
}

/** The colored rim of the Windows Island style (a hairline when "classic"). */
function Rim({ look }: { look: Appearance }) {
	const background = rimBackground(look.rim);
	return (
		<span
			className={`rim ${background ? "" : "is-classic"} ${background && look.animate ? "is-animated" : ""}`}
			style={{ "--rim-bg": background, "--rim-w": `${background ? look.thickness : 1}px` } as CSSProperties}
		/>
	);
}

function glowStyle(look: Appearance): CSSProperties | undefined {
	if (!look.glow || !look.rim.length) return undefined;
	const color = look.rim[Math.floor(look.rim.length / 2)];
	return { boxShadow: `0 0 20px -2px ${color}bb, 0 14px 34px -14px rgba(0, 0, 0, 0.7)` };
}

function Tabs({
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
						{selected && <motion.span layoutId="tab-pill" className="tab-pill" transition={transition} />}
						<span className="tab-icon">{view.icon}</span>
						{/* Many modules: only the open tab spells out its name. */}
						{!iconsOnly && selected && <span className="tab-label">{t(module.title)}</span>}
						{view.active && !selected && <span className="tab-dot" />}
					</button>
				);
			})}
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

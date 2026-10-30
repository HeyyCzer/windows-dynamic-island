import { motion } from "motion/react";
import { useMemo } from "react";
import { useAppearance } from "../core/appearance";
import { useTauriEvent } from "../core/bridge";
import { cn } from "../core/cn";
import { useSyncLocale } from "../core/i18n";
import { type IslandApi, IslandContext } from "../core/island";
import { useHitRects } from "../core/useHitRects";
import { useIslandController } from "../core/useIslandController";
import { useIslandDrag } from "../core/useIslandDrag";
import { modules } from "../modules";
import { requestAskFocus } from "../modules/ask/store";
import { requestFindFocus } from "../modules/find/store";
import { AmbientBubbles, SecondaryBubble } from "./island/Bubbles";
import { islandContent } from "./island/content";
import { ambientWidth, BUBBLE, BUBBLE_GAP, geometry, variantOf } from "./island/geometry";
import { launcherSize } from "./island/Launcher";
import { Rim } from "./island/Rim";
import { Surface } from "./island/Surface";
import { useIslandFileDrop } from "./island/useIslandFileDrop";

export function Island() {
	const ctl = useIslandController(modules);
	const { mode, primary, secondary, focused } = ctl;
	const look = useAppearance();
	const windows = look.style === "windows";
	const v = variantOf(look);
	useHitRects();
	useSyncLocale();
	useIslandFileDrop(ctl);

	const bigSize = ctl.launcher ? launcherSize(ctl.entries.length) : focused?.view.expandedSize;
	const g = geometry(v, look, mode, bigSize, primary);
	const big = mode === "expanded" || mode === "peek";
	const hidden = mode === "hidden";
	const swallowed = mode === "swallowed";
	const resting = mode === "compact" || mode === "idle";
	const showSecondary = mode === "compact" && secondary !== undefined;
	const transition = big ? v.expandSpring : v.shellSpring;

	const drag = useIslandDrag({
		width: g.width,
		leftExtra: g.ear + (resting ? ambientWidth(ctl.entries.filter((e) => e.view.ambient).length) : 0),
		rightExtra: g.ear + (showSecondary ? BUBBLE_GAP + BUBBLE : 0),
		canReturn: !big,
		onDragChange: ctl.lockHover,
	});

	// Global shortcut: the page opens (controller) and its input takes the keyboard.
	useTauriEvent("island://ask", requestAskFocus);
	useTauriEvent("island://find", requestFindFocus);

	const api: IslandApi = useMemo(
		() => ({ mode, tab: ctl.tab, expand: ctl.expand, collapse: ctl.collapse, keepOpen: ctl.keepOpen }),
		[mode, ctl.tab, ctl.expand, ctl.collapse, ctl.keepOpen],
	);

	const content = islandContent(ctl, look, v);
	const rim = windows ? <Rim look={look} /> : null;
	const bubble = { transition: v.shellSpring, rim, onOpen: ctl.expand };

	return (
		<IslandContext.Provider value={api}>
			<div className="pointer-events-none fixed inset-0 flex items-start justify-center">
				{/* The tray's black hole: the island spins into its own center and comes back out. */}
				<motion.div
					className="pointer-events-none relative flex origin-center justify-center"
					initial={false}
					animate={swallowed ? { scale: 0, rotate: -200, opacity: 0 } : { scale: 1, rotate: 0, opacity: 1 }}
					transition={
						swallowed
							? { duration: 0.46, ease: [0.55, 0, 1, 0.45] }
							: { duration: 0.56, ease: [0.34, 1.4, 0.64, 1], opacity: { duration: 0.26 } }
					}
				>
					<motion.div
						className={cn(
							"pointer-events-auto relative touch-none will-change-[width,height,transform]",
							drag.dragging && "cursor-grabbing **:cursor-grabbing",
						)}
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
						{/* Concave "ears" that blend the notch into the top edge of the screen. */}
						{!windows && (
							<>
								<motion.span
									className="pointer-events-none absolute top-0 right-full bg-[radial-gradient(circle_at_0_100%,transparent_70%,var(--island)_71%)]"
									initial={false}
									animate={{ width: g.ear, height: g.ear }}
									transition={v.shellSpring}
								/>
								<motion.span
									className="pointer-events-none absolute top-0 left-full bg-[radial-gradient(circle_at_100%_100%,transparent_70%,var(--island)_71%)]"
									initial={false}
									animate={{ width: g.ear, height: g.ear }}
									transition={v.shellSpring}
								/>
							</>
						)}

						<Surface g={g} big={big} look={look} transition={transition} contentKey={content.key} rim={rim}>
							{content.node}
						</Surface>

						<AmbientBubbles entries={ctl.entries} visible={resting} shrunk={mode === "idle" && !windows} {...bubble} />
						<SecondaryBubble entry={showSecondary ? secondary : undefined} {...bubble} />
					</motion.div>
				</motion.div>
			</div>
		</IslandContext.Provider>
	);
}

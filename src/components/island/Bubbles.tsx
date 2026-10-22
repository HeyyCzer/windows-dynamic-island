import { AnimatePresence, motion, type Transition } from "motion/react";
import type { ReactNode } from "react";
import type { ModuleEntry } from "../../core/types";

interface BubbleProps {
	transition: Transition;
	/** The rim drawn around each bubble (Windows Island style). */
	rim: ReactNode;
	onOpen: (moduleId: string) => void;
}

/** Modules with an `ambient` glyph, as bubbles left of the resting island. */
export function AmbientBubbles({
	entries,
	visible,
	shrunk,
	...bubble
}: BubbleProps & { entries: ModuleEntry[]; visible: boolean; shrunk: boolean }) {
	return (
		<div className="ambient-bubbles">
			<AnimatePresence>
				{visible &&
					entries
						.filter((e) => e.view.ambient)
						.map(({ module, view }) => (
							<Bubble key={module.id} id={module.id} className="bubble ambient" from={40} scale={shrunk ? 0.84 : 1} layout {...bubble}>
								{view.ambient}
							</Bubble>
						))}
			</AnimatePresence>
		</div>
	);
}

/** The second busiest module, as a bubble right of the compact island. */
export function SecondaryBubble({ entry, ...bubble }: BubbleProps & { entry: ModuleEntry | undefined }) {
	return (
		<AnimatePresence>
			{entry && (
				<Bubble key={entry.module.id} id={entry.module.id} className="bubble" from={-40} {...bubble}>
					{entry.view.icon}
				</Bubble>
			)}
		</AnimatePresence>
	);
}

function Bubble({
	id,
	className,
	from,
	scale = 1,
	layout,
	transition,
	rim,
	onOpen,
	children,
}: BubbleProps & {
	id: string;
	className: string;
	/** Horizontal offset it slides in from and out to. */
	from: number;
	scale?: number;
	layout?: boolean;
	children: ReactNode;
}) {
	return (
		<motion.button
			className={className}
			data-hit
			layout={layout}
			initial={{ opacity: 0, scale: 0.3, x: from }}
			animate={{ opacity: 1, scale, x: 0 }}
			exit={{ opacity: 0, scale: 0.3, x: from }}
			transition={transition}
			onClick={(e) => {
				e.stopPropagation();
				onOpen(id);
			}}
		>
			{children}
			{rim}
		</motion.button>
	);
}

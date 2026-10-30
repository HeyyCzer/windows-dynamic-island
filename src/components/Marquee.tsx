import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "../core/cn";

/** Single-line text that scrolls back and forth when it doesn't fit. */
export function Marquee({ text, className }: { text: string; className?: string }) {
	const outer = useRef<HTMLDivElement>(null);
	const inner = useRef<HTMLSpanElement>(null);
	const [overflow, setOverflow] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the text changes
	useLayoutEffect(() => {
		const measure = () => {
			if (!outer.current || !inner.current) return;
			setOverflow(Math.max(0, inner.current.scrollWidth - outer.current.clientWidth));
		};
		measure();
		const ro = new ResizeObserver(measure);
		if (outer.current) ro.observe(outer.current);
		return () => ro.disconnect();
	}, [text]);

	return (
		<div
			ref={outer}
			className={cn(
				"overflow-hidden whitespace-nowrap",
				overflow && "[mask-image:linear-gradient(90deg,transparent_0,#000_12px,#000_calc(100%-16px),transparent)]",
				className,
			)}
		>
			<span
				ref={inner}
				className={cn("inline-block", overflow && "animate-marquee px-3")}
				style={
					overflow
						? ({
								"--marquee-distance": `-${overflow}px`,
								"--marquee-duration": `${Math.max(6, overflow / 18)}s`,
							} as React.CSSProperties)
						: undefined
				}
			>
				{text}
			</span>
		</div>
	);
}

import { useEffect } from "react";
import { command, isTauri } from "./bridge";

/** The island's fill while the glass is on: dark enough to read, clear enough to see the blur. */
const GLASS_TINT = "rgb(0 0 0 / 0.55)";

type Kind = "rect" | "earLeft" | "earRight";

interface GlassShape {
	/** The element's own (untransformed) size and radii. */
	width: number;
	height: number;
	radiusTop: number;
	radiusBottom: number;
	kind: Kind;
	/** `[a, b, c, d, e, f]` as in CSS `matrix()`: own px to window px. */
	transform: number[];
}

const round = (v: number) => Math.round(v * 1000) / 1000;

function measure(el: HTMLElement): GlassShape | undefined {
	const style = getComputedStyle(el);
	// Fractional while springs run (`offsetWidth` rounds); border-box, like the probes' 100%.
	const width = Number.parseFloat(style.width) || el.offsetWidth;
	const height = Number.parseFloat(style.height) || el.offsetHeight;
	const probes = el.querySelectorAll<HTMLElement>(":scope > [data-glass-probe]");
	if (width < 1 || height < 1 || probes.length !== 3) return undefined;
	const [o, x, y] = Array.from(probes, (p) => p.getBoundingClientRect());
	// Where the corners land: origin, then one step along each local axis.
	const a = (x.left - o.left) / width;
	const b = (x.top - o.top) / width;
	const c = (y.left - o.left) / height;
	const d = (y.top - o.top) / height;
	// Slid out of the window (hidden island): nothing to blur.
	const bottom = Math.max(o.top, x.top, y.top, x.top + y.top - o.top);
	if (bottom <= 0) return undefined;
	const kind = el.dataset.glass === "earLeft" || el.dataset.glass === "earRight" ? el.dataset.glass : "rect";
	return {
		width,
		height,
		radiusTop: Number.parseFloat(style.borderTopLeftRadius) || 0,
		radiusBottom: Number.parseFloat(style.borderBottomLeftRadius) || 0,
		kind,
		transform: [a, b, c, d, o.left, o.top].map(round),
	};
}

/**
 * Frosted glass behind the island. The blur itself is a native window the
 * backend keeps cut to the island's outline: every element marked with
 * `data-glass` is part of it (inside a `data-glass-off` subtree it isn't, e.g.
 * while the island spins away). Measured every frame so the blur follows the
 * springs; only changes are sent.
 */
export function useGlass(enabled: boolean) {
	useEffect(() => {
		const root = document.documentElement.style;
		if (enabled) root.setProperty("--island", GLASS_TINT);
		if (!isTauri) return () => root.removeProperty("--island");

		let raf = 0;
		let last = "";
		const send = (shapes: GlassShape[]) => {
			const key = JSON.stringify(shapes);
			if (key === last) return;
			last = key;
			command("set_glass_shapes", { shapes });
		};

		if (enabled) {
			const tick = () => {
				raf = requestAnimationFrame(tick);
				const shapes: GlassShape[] = [];
				for (const el of document.querySelectorAll<HTMLElement>("[data-glass]")) {
					if (el.closest("[data-glass-off]")) continue;
					const shape = measure(el);
					if (shape) shapes.push(shape);
				}
				send(shapes);
			};
			raf = requestAnimationFrame(tick);
		}
		return () => {
			cancelAnimationFrame(raf);
			root.removeProperty("--island");
			if (enabled) command("set_glass_shapes", { shapes: [] });
		};
	}, [enabled]);
}

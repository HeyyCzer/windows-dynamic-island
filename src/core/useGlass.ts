import { useEffect, useState } from "react";
import { command, isTauri } from "./bridge";
import type { GlassLevel } from "./settings";

/** The island's fill while the glass is on: dark enough to read, clear enough to see the blur. */
const GLASS_TINT = "rgb(0 0 0 / 0.55)";

/** Unchanged frames before the outline is measured less often. */
const IDLE_AFTER = 10;

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

/** Asked once: the backend knows whether it could set the glass up (Windows 11). */
let supportCheck: Promise<boolean> | undefined;

/** Whether this system has frosted glass; `false` until known. The browser preview always does. */
export function useGlassSupported() {
	const [supported, setSupported] = useState(!isTauri);
	useEffect(() => {
		if (!isTauri) return;
		supportCheck ??= command<boolean>("glass_supported").catch(() => false);
		let live = true;
		supportCheck.then((ok) => live && setSupported(ok));
		return () => {
			live = false;
		};
	}, []);
	return supported;
}

/**
 * Frosted glass behind the island. The blur itself is a native window the
 * backend keeps cut to the island's outline: every element marked with
 * `data-glass` is part of it (inside a `data-glass-off` subtree it isn't, e.g.
 * while the island spins away). Measured every frame so the blur follows the
 * springs; only changes are sent.
 */
export function useGlass(level: GlassLevel) {
	// Without the glass (Windows 10) the island stays solid, whatever is saved.
	const enabled = useGlassSupported() && level !== "off";

	// How much blur the backend adds on top of the system's.
	useEffect(() => {
		if (isTauri && enabled) command("set_glass_level", { level });
	}, [enabled, level]);

	useEffect(() => {
		const root = document.documentElement.style;
		if (enabled) root.setProperty("--island", GLASS_TINT);
		if (!isTauri) return () => root.removeProperty("--island");

		let raf = 0;
		let last = "";
		let frame = 0;
		/** Frames in a row the outline didn't change. */
		let still = 0;
		const send = (shapes: GlassShape[]) => {
			const key = JSON.stringify(shapes);
			if (key === last) {
				still++;
				return;
			}
			still = 0;
			last = key;
			command("set_glass_shapes", { shapes });
		};

		if (enabled) {
			const tick = () => {
				raf = requestAnimationFrame(tick);
				// At rest, every other frame is enough: a spring that starts is caught a frame late at most.
				if (still > IDLE_AFTER && frame++ % 2) return;
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

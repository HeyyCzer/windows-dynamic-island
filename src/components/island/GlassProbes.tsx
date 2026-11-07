/**
 * Three zero-size points pinned to a `data-glass` element's top-left,
 * top-right and bottom-left corners. Where they land on screen gives the
 * element's full 2D transform (the drag's skew and squash, a bubble's scale),
 * which `getBoundingClientRect` alone flattens into a box.
 */
export function GlassProbes() {
	return (
		<>
			<span data-glass-probe className="pointer-events-none absolute top-0 left-0 size-0" />
			<span data-glass-probe className="pointer-events-none absolute top-0 left-full size-0" />
			<span data-glass-probe className="pointer-events-none absolute top-full left-0 size-0" />
		</>
	);
}

import type { CSSProperties } from "react";
import { rimBackground, type Appearance } from "../../core/appearance";

/** The colored rim of the Windows Island style (a hairline when "classic"). */
export function Rim({ look }: { look: Appearance }) {
	const background = rimBackground(look.rim);
	return (
		<span
			className={`rim ${background ? "" : "is-classic"} ${background && look.animate ? "is-animated" : ""}`}
			style={{ "--rim-bg": background, "--rim-w": `${background ? look.thickness : 1}px` } as CSSProperties}
		/>
	);
}

/** A glow in the rim's middle color, when turned on. */
export function glowStyle(look: Appearance): CSSProperties | undefined {
	if (!look.glow || !look.rim.length) return undefined;
	const color = look.rim[Math.floor(look.rim.length / 2)];
	return { boxShadow: `0 0 20px -2px ${color}bb, 0 14px 34px -14px rgba(0, 0, 0, 0.7)` };
}

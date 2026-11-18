import { motion } from "motion/react";
import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { cn } from "../../core/cn";

/** Group heading in the sidebar. */
export function NavSection({ label }: { label: string }) {
	return (
		<span className="px-3 pt-3.5 pb-1 text-[10.5px] font-bold tracking-[0.06em] text-text-faint uppercase first:pt-1">
			{label}
		</span>
	);
}

/**
 * Sidebar entry; the pill slides to whichever one is active (`end: false` also
 * matches sub-pages). `sm`: an entry folded under another one.
 */
export function NavItem({
	to,
	icon,
	label,
	off,
	end = true,
	size = "md",
	className,
}: {
	to: string;
	icon: ReactNode;
	label: string;
	off?: boolean;
	end?: boolean;
	size?: "md" | "sm";
	className?: string;
}) {
	return (
		<NavLink
			to={to}
			end={end}
			className={({ isActive }) =>
				cn(
					"relative flex cursor-pointer items-center rounded-[9px] px-3 text-left font-[550] text-text-dim no-underline transition-colors duration-150 [-webkit-user-drag:none] hover:bg-white/3.5 hover:text-text",
					size === "sm" ? "h-7.5 gap-2.25 text-[12.5px]" : "h-9 gap-2.75 text-[13.5px]",
					isActive && "text-text",
					className,
				)
			}
		>
			{({ isActive }) => (
				<>
					{isActive && (
						<motion.span
							layoutId="nav-pill"
							className="absolute inset-0 rounded-[inherit] bg-white/7 shadow-[inset_0_0_0_1px_var(--hairline)] before:absolute before:inset-y-2.5 before:left-0 before:w-0.75 before:rounded-full before:bg-accent"
							transition={{ type: "spring", stiffness: 500, damping: 38 }}
						/>
					)}
					{/* Folded entries draw every icon at one size, whatever size it came in. */}
					<span
						className={cn("relative grid w-4 place-items-center", size === "sm" && "[&_img]:size-3.5 [&_svg]:size-3.5")}
					>
						{icon}
					</span>
					<span className={cn("relative truncate", off && "opacity-50")}>{label}</span>
				</>
			)}
		</NavLink>
	);
}

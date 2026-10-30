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

/** Sidebar entry; the pill slides to whichever one is active (`end: false` also matches sub-pages). */
export function NavItem({
	to,
	icon,
	label,
	off,
	end = true,
}: {
	to: string;
	icon: ReactNode;
	label: string;
	off?: boolean;
	end?: boolean;
}) {
	return (
		<NavLink
			to={to}
			end={end}
			className={({ isActive }) =>
				cn(
					"relative flex h-9 cursor-pointer items-center gap-2.75 rounded-[9px] px-3 text-left text-[13.5px] font-[550] text-text-dim no-underline transition-colors duration-150 [-webkit-user-drag:none] hover:bg-white/3.5 hover:text-text",
					isActive && "text-text",
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
					<span className="relative grid w-4 place-items-center">{icon}</span>
					<span className={cn("relative truncate", off && "opacity-50")}>{label}</span>
				</>
			)}
		</NavLink>
	);
}

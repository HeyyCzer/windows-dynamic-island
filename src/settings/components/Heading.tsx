import type { ReactNode } from "react";
import { Link } from "react-router";

/** A page's heading, optionally with its module's icon in a tile. */
export function Title({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
	return (
		<h1 className="mb-1.5 flex items-center gap-2.5 text-[24px] font-bold tracking-[-0.015em]">
			{icon && (
				<span className="grid size-8 place-items-center rounded-[9px] bg-white/6 shadow-[inset_0_0_0_1px_var(--hairline)]">
					{icon}
				</span>
			)}
			{children}
		</h1>
	);
}

/** A sentence under the title, introducing the page. */
export function Lead({ children }: { children: ReactNode }) {
	return <p className="-mt-0.5 mb-3.5 text-[12.5px]/[1.45] text-text-dim">{children}</p>;
}

/** "‹ Back" link above a sub-page's title. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
	return (
		<Link to={to} className="mb-1.5 inline-block text-[12.5px] font-semibold text-text-faint hover:text-text">
			‹ {children}
		</Link>
	);
}

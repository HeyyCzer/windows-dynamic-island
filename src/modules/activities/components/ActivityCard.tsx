import { motion } from "motion/react";
import { Badge } from "../../../components/Glyph";
import { providerAction } from "../../../core/bridge";
import { cn } from "../../../core/cn";
import { useIsland } from "../../../core/island";
import { ACTIVITIES_PROVIDER, type Activity } from "../types";

/** Opens what an activity points to: its link or app, or the module it came from. */
export function useOpenActivity() {
	const island = useIsland();
	return (a: Activity) => {
		if (a.source === "ask") island.expand("ask");
		else if (a.action) providerAction(ACTIVITIES_PROVIDER, "open", a.id);
	};
}

/** One activity, large: badge, caption, title, subtitle and progress. */
export function ActivityCard({ activity: a, compact = false }: { activity: Activity; compact?: boolean }) {
	const open = useOpenActivity();
	const color = a.color ?? "#ffffff";
	const clickable = !!a.action || a.source === "ask";
	return (
		<div
			className={cn(
				"relative flex items-start gap-3.5 rounded-[14px] px-1 py-1.5",
				compact && "items-center gap-3 px-2",
				clickable && "cursor-pointer hover:bg-white/5",
			)}
			onClick={(e) => {
				if (!clickable) return;
				e.stopPropagation();
				open(a);
			}}
		>
			<Badge icon={a.icon} image={a.image} color={color} size={compact ? 34 : 46} />
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				{a.caption && <span className="text-[11.5px] font-semibold text-text-faint">{a.caption}</span>}
				<span className={cn("truncate text-[15px] font-[650]", compact && "text-[13.5px]")}>{a.title || " "}</span>
				{a.subtitle && (
					<span className={cn("line-clamp-2 text-[13px]/[1.35] text-text-dim", compact && "line-clamp-1 text-[12px]")}>
						{a.subtitle}
					</span>
				)}
				{a.progress != null && (
					<div className="mt-2 flex items-center gap-2.5">
						<div className="relative h-1.25 flex-1 overflow-hidden rounded-full bg-white/14">
							<motion.div
								className="absolute inset-0 origin-left rounded-[inherit]"
								style={{ background: color }}
								initial={false}
								animate={{ scaleX: Math.min(1, Math.max(0, a.progress)) }}
								transition={{ type: "spring", stiffness: 260, damping: 30 }}
							/>
						</div>
						<span className="text-[12px] font-semibold text-text-dim tabular-nums">
							{Math.round(a.progress * 100)}%
						</span>
					</div>
				)}
			</div>
			{!compact && a.expiresAt == null && (
				<button
					type="button"
					className="size-5.5 flex-none rounded-full text-[15px] leading-none text-text-faint hover:bg-white/8 hover:text-text"
					title="×"
					onClick={(e) => {
						e.stopPropagation();
						providerAction(ACTIVITIES_PROVIDER, "remove", a.id);
					}}
				>
					×
				</button>
			)}
		</div>
	);
}

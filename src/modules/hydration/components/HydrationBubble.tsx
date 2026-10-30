import { WaterDropIcon } from "../../../components/icons";
import { cn } from "../../../core/cn";
import { useNow } from "../../ai-agents/common/format";

function remainingLabel(deadline: number, now: number) {
	const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const rest = String(seconds % 60).padStart(2, "0");
	return hours ? `${hours}h${String(minutes).padStart(2, "0")}` : `${minutes}:${rest}`;
}

/** Persistent countdown shown in the ambient bubble slot. */
export function HydrationBubble({ deadline, due }: { deadline: number | null; due: boolean }) {
	const now = useNow(1000, !!deadline && !due);
	return (
		<span
			className={cn(
				"grid h-8.5 min-w-8.5 place-items-center rounded-full px-0.5 text-[10px] font-[750] tracking-[-0.04em] text-[#82ddf3] tabular-nums",
				due && "animate-hydration-pulse bg-[rgba(69,196,230,0.18)] text-white",
			)}
		>
			{deadline && !due ? <span>{remainingLabel(deadline, now)}</span> : <WaterDropIcon size={17} />}
		</span>
	);
}

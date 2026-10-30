import { motion } from "motion/react";
import { useT } from "../../../../core/i18n";
import { formatIn } from "../format";
import type { UsageLimit } from "../types";

/** Plan-limit meter: label, % used, animated bar and reset countdown. */
export function LimitBar({ limit, color, now }: { limit: UsageLimit; color: string; now: number }) {
	const t = useT();
	const pct = Math.max(0, Math.min(100, limit.usedPct));
	const tone = pct >= 90 ? "#ff5f57" : pct >= 75 ? "#ffbd2e" : color;

	return (
		<div>
			<div className="mb-1.25 flex justify-between text-[12.5px] font-semibold">
				<span className="text-text-dim">{limit.label}</span>
				<span className="tabular-nums" style={{ color: tone }}>
					{Math.round(pct)}%
				</span>
			</div>
			<div className="h-1.75 overflow-hidden rounded-full bg-white/9">
				<motion.div
					className="h-full origin-left rounded-[inherit]"
					style={{ background: tone }}
					initial={{ scaleX: 0 }}
					animate={{ scaleX: pct / 100 }}
					transition={{ type: "spring", stiffness: 120, damping: 20 }}
				/>
			</div>
			{limit.resetsAt && limit.resetsAt > now && (
				<span className="mt-1 block text-[11px] text-text-faint">
					{t("agents.limit.resetsIn", { time: formatIn(t, limit.resetsAt, now) })}
				</span>
			)}
		</div>
	);
}

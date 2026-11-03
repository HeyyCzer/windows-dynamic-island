import { CoffeeIcon, PartyPopperIcon, SparklesIcon } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useT } from "../../../core/i18n";

export function WorkCountdownWidget({ settings }: { settings: Record<string, unknown> }) {
	const t = useT();
	const offTimeStr = String(settings.offWorkTime ?? "18:00");
	const startTimeStr = String(settings.workStartTime ?? "09:00");

	const [now, setNow] = useState(new Date());

	useEffect(() => {
		const interval = setInterval(() => setNow(new Date()), 1000);
		return () => clearInterval(interval);
	}, []);

	const [offHour, offMin] = offTimeStr.split(":").map(Number);
	const [startHour, startMin] = startTimeStr.split(":").map(Number);

	const targetToday = new Date(now);
	targetToday.setHours(offHour, offMin, 0, 0);

	const startToday = new Date(now);
	startToday.setHours(startHour, startMin, 0, 0);

	const diffMs = targetToday.getTime() - now.getTime();
	const isOffWork = diffMs <= 0;

	const totalWorkSpan = targetToday.getTime() - startToday.getTime();
	const elapsedSpan = Math.max(0, now.getTime() - startToday.getTime());
	const progressPercent = Math.min(100, Math.max(0, Math.round((elapsedSpan / (totalWorkSpan || 1)) * 100)));

	const remainingSeconds = Math.max(0, Math.floor(diffMs / 1000));
	const remHours = Math.floor(remainingSeconds / 3600);
	const remMinutes = Math.floor((remainingSeconds % 3600) / 60);
	const remSecs = remainingSeconds % 60;

	const dayOfWeek = now.getDay();
	const daysToWeekend = dayOfWeek >= 5 ? 0 : 5 - dayOfWeek;

	return (
		<div className="flex h-full flex-col justify-center gap-2 px-1 select-none">
			{/* Top Bar: Schedule & Status Summary */}
			<div className="flex items-center justify-between border-b border-white/8 pb-1.5">
				<div className="flex items-center gap-3 min-w-0">
					<motion.div
						whileHover={{ rotate: 15 }}
						transition={{ type: "spring", stiffness: 400, damping: 20 }}
						className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-amber-500/18 text-amber-400"
					>
						{isOffWork ? <PartyPopperIcon size={19} /> : <CoffeeIcon size={19} />}
					</motion.div>
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<span className="text-[13px] font-semibold text-text whitespace-nowrap">
								{isOffWork
									? t("marketplace.widgets.workCountdown.freeTime")
									: t("marketplace.widgets.workCountdown.title")}
							</span>
							<span className="rounded-full bg-amber-400/18 px-2 py-0.2 text-[10.5px] font-medium text-amber-300 shrink-0 whitespace-nowrap">
								{isOffWork
									? t("marketplace.widgets.workCountdown.offWork")
									: t("marketplace.widgets.workCountdown.chilling")}
							</span>
						</div>
						<p className="text-[11px] text-text-faint whitespace-nowrap">
							{t("marketplace.widgets.workCountdown.target", { start: startTimeStr, end: offTimeStr })}
						</p>
					</div>
				</div>

				<motion.span
					whileHover={{ scale: 1.05 }}
					transition={{ type: "spring", stiffness: 450, damping: 22 }}
					className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/8 px-3 py-1 text-xs font-medium text-amber-300/90 border border-white/6 whitespace-nowrap ml-2"
				>
					<SparklesIcon size={12} />
					<span>
						{daysToWeekend === 0
							? t("marketplace.widgets.workCountdown.weekendParty")
							: t("marketplace.widgets.workCountdown.weekendInDays", { n: daysToWeekend })}
					</span>
				</motion.span>
			</div>

			{/* Center & Sub-metrics Row (Desktop Enhanced) */}
			<div className="flex items-center justify-between pt-0.5">
				<div className="flex flex-col min-w-0 pr-4">
					<span className="text-[10.5px] text-text-faint whitespace-nowrap">
						{t("marketplace.widgets.workCountdown.remainingTitle")}
					</span>
					<div className="font-mono text-[28px]/[1.1] font-bold tracking-tight text-text tabular-nums whitespace-nowrap">
						{isOffWork ? (
							<span className="text-[20px] text-amber-300">{t("marketplace.widgets.workCountdown.achieved")}</span>
						) : (
							`${String(remHours).padStart(2, "0")}:${String(remMinutes).padStart(2, "0")}:${String(remSecs).padStart(2, "0")}`
						)}
					</div>
				</div>

				{/* 3 Metric Pills Side by Side with Tactile Hover */}
				<div className="flex items-center gap-2.5 shrink-0">
					<motion.div
						whileHover={{ scale: 1.05 }}
						transition={{ type: "spring", stiffness: 450, damping: 25 }}
						className="flex flex-col items-center rounded-xl bg-white/4 border border-white/5 px-3 py-1.5 min-w-[72px]"
					>
						<span className="text-[10px] text-text-faint whitespace-nowrap">
							{t("marketplace.widgets.workCountdown.progress")}
						</span>
						<span className="font-mono text-xs font-bold text-amber-300 tabular-nums">{progressPercent}%</span>
					</motion.div>
					<motion.div
						whileHover={{ scale: 1.05 }}
						transition={{ type: "spring", stiffness: 450, damping: 25 }}
						className="flex flex-col items-center rounded-xl bg-white/4 border border-white/5 px-3 py-1.5 min-w-[80px]"
					>
						<span className="text-[10px] text-text-faint whitespace-nowrap">
							{t("marketplace.widgets.workCountdown.worked")}
						</span>
						<span className="font-mono text-xs font-bold text-text tabular-nums whitespace-nowrap">
							{Math.floor(elapsedSpan / 3600000)}h {Math.floor((elapsedSpan % 3600000) / 60000)}m
						</span>
					</motion.div>
					<motion.div
						whileHover={{ scale: 1.05 }}
						transition={{ type: "spring", stiffness: 450, damping: 25 }}
						className="flex flex-col items-center rounded-xl bg-white/4 border border-white/5 px-3 py-1.5 min-w-[76px]"
					>
						<span className="text-[10px] text-text-faint whitespace-nowrap">
							{t("marketplace.widgets.workCountdown.status")}
						</span>
						<span className="text-xs font-semibold text-emerald-400 whitespace-nowrap">
							{t("marketplace.widgets.workCountdown.stableChilling")}
						</span>
					</motion.div>
				</div>
			</div>
		</div>
	);
}

import { CoffeeIcon, PauseIcon, PlayIcon, RotateCcwIcon, TimerIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { useT } from "../../../core/i18n";
import { usePomodoroLive } from "../pluginActivityStore";

export function PomodoroWidget({ settings }: { settings: Record<string, unknown> }) {
	const t = useT();
	const pomodoro = usePomodoroLive();
	const workMinutes = Number(settings.workDuration ?? 25);
	const breakMinutes = Number(settings.breakDuration ?? 5);

	useEffect(() => {
		pomodoro.setDurations(workMinutes, breakMinutes);
	}, [workMinutes, breakMinutes, pomodoro.setDurations]);

	const { mode, formattedTime, progressPercent, isRunning } = pomodoro;

	const handleReset = (e: React.MouseEvent) => {
		e.stopPropagation();
		pomodoro.reset();
	};

	const switchMode = (newMode: "work" | "break", e: React.MouseEvent) => {
		e.stopPropagation();
		pomodoro.switchMode(newMode);
	};

	const toggleRunning = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (isRunning) {
			pomodoro.pause();
		} else {
			pomodoro.start();
		}
	};

	const isWork = mode === "work";

	return (
		<div className="relative flex h-full items-center justify-between px-3.5 select-none">
			{/* Leading: Icon + Mode Title + Shared Layout Mode Switcher */}
			<div className="flex min-w-0 items-center gap-3">
				<motion.div
					key={mode}
					initial={{ scale: 0.8, rotate: -15, opacity: 0 }}
					animate={{ scale: 1, rotate: 0, opacity: 1 }}
					transition={{ type: "spring", stiffness: 450, damping: 25 }}
					className={`flex size-11 shrink-0 items-center justify-center rounded-2xl transition-colors ${
						isWork ? "bg-red-500/18 text-red-400" : "bg-emerald-500/18 text-emerald-400"
					}`}
				>
					{isWork ? <TimerIcon size={22} /> : <CoffeeIcon size={22} />}
				</motion.div>
				<div className="flex min-w-0 flex-col">
					<div className="flex items-center gap-2">
						<span className="text-[13px] font-semibold text-text whitespace-nowrap">
							{isWork ? t("marketplace.widgets.pomodoro.focus") : t("marketplace.widgets.pomodoro.break")}
						</span>
						{isRunning && (
							<span
								className="size-1.5 shrink-0 rounded-full animate-pulse"
								style={{ backgroundColor: isWork ? "#f87171" : "#34d399" }}
							/>
						)}
					</div>
					<div className="mt-1 flex items-center gap-1.5 flex-wrap">
						{/* Mode Pills with Sliding Magic Morph Indicator */}
						<button
							type="button"
							onClick={(e) => switchMode("work", e)}
							className={`relative rounded-md px-2 py-0.5 text-xs transition-colors shrink-0 whitespace-nowrap ${
								isWork ? "font-semibold text-red-400" : "text-text-faint hover:text-text"
							}`}
						>
							{isWork && (
								<motion.span
									layoutId="pomodoro-mode-pill"
									className="absolute inset-0 rounded-md bg-red-500/20 ring-1 ring-red-500/30"
									transition={{ type: "spring", stiffness: 450, damping: 30 }}
								/>
							)}
							<span className="relative z-10">
								{t("marketplace.widgets.pomodoro.workLabel")} ({workMinutes}m)
							</span>
						</button>
						<button
							type="button"
							onClick={(e) => switchMode("break", e)}
							className={`relative rounded-md px-2 py-0.5 text-xs transition-colors shrink-0 whitespace-nowrap ${
								!isWork ? "font-semibold text-emerald-400" : "text-text-faint hover:text-text"
							}`}
						>
							{!isWork && (
								<motion.span
									layoutId="pomodoro-mode-pill"
									className="absolute inset-0 rounded-md bg-emerald-500/20 ring-1 ring-emerald-500/30"
									transition={{ type: "spring", stiffness: 450, damping: 30 }}
								/>
							)}
							<span className="relative z-10">
								{t("marketplace.widgets.pomodoro.breakLabel")} ({breakMinutes}m)
							</span>
						</button>
					</div>
				</div>
			</div>

			{/* Center: Hero Timer Anchor-Locked to Geometric Physical Center (Zero displacement on state toggle) */}
			<div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center">
				<div className="font-mono text-[36px]/[1] font-bold tracking-tight text-text tabular-nums">{formattedTime}</div>
				<div className="mt-2 flex items-center gap-2">
					<div className="h-1.5 w-36 overflow-hidden rounded-full bg-white/10">
						<motion.div
							className={`h-full origin-left rounded-[inherit] ${isWork ? "bg-red-500" : "bg-emerald-400"}`}
							initial={{ scaleX: 0 }}
							animate={{ scaleX: Math.max(0.01, progressPercent / 100) }}
							transition={{ type: "spring", stiffness: 140, damping: 22 }}
						/>
					</div>
					<span className="font-mono text-[11px] text-text-faint tabular-nums w-8 text-left">{progressPercent}%</span>
				</div>
			</div>

			{/* Trailing: Tactile Frosted Capsule Actions with Stable Width */}
			<div className="flex shrink-0 items-center gap-2">
				<motion.button
					type="button"
					whileHover={{ scale: 1.04 }}
					whileTap={{ scale: 0.92 }}
					transition={{ type: "spring", stiffness: 500, damping: 26 }}
					onClick={toggleRunning}
					className={`flex h-9 w-28 shrink-0 items-center justify-center gap-2 rounded-full text-xs font-semibold text-white shadow-sm transition-colors whitespace-nowrap ${
						isRunning
							? "bg-white/15 hover:bg-white/20"
							: isWork
								? "bg-red-500 hover:bg-red-600"
								: "bg-emerald-500 hover:bg-emerald-600"
					}`}
				>
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span
							key={isRunning ? "pause" : "play"}
							initial={{ scale: 0.5, rotate: -25, opacity: 0 }}
							animate={{ scale: 1, rotate: 0, opacity: 1 }}
							exit={{ scale: 0.5, rotate: 25, opacity: 0 }}
							transition={{ type: "spring", stiffness: 500, damping: 28 }}
							className="grid"
						>
							{isRunning ? (
								<PauseIcon size={14} className="fill-white" />
							) : (
								<PlayIcon size={14} className="fill-white" />
							)}
						</motion.span>
					</AnimatePresence>
					<span>{isRunning ? t("marketplace.widgets.pomodoro.pause") : t("marketplace.widgets.pomodoro.start")}</span>
				</motion.button>
				<motion.button
					type="button"
					whileHover={{ scale: 1.08 }}
					whileTap={{ scale: 0.88, rotate: -45 }}
					transition={{ type: "spring", stiffness: 500, damping: 24 }}
					onClick={handleReset}
					title={t("marketplace.widgets.pomodoro.reset")}
					className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/8 text-text-faint transition-colors hover:bg-white/16 hover:text-text"
				>
					<RotateCcwIcon size={14} />
				</motion.button>
			</div>
		</div>
	);
}

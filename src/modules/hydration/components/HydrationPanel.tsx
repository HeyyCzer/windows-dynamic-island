import { DropletIcon } from "lucide-react";
import { SectionLabel } from "../../../components/ui/text";
import { useT } from "../../../core/i18n";
import { useNow } from "../../ai-agents/common/format";

const button =
	"h-8 rounded-2xl px-3.25 text-[12px] font-bold transition-[filter,background] duration-150 hover:brightness-114";
const primary = `${button} bg-[#2ea9cc] text-white`;
const secondary = `${button} bg-white/9 text-text-dim`;

function remainingLabel(deadline: number, now: number) {
	const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const rest = String(seconds % 60).padStart(2, "0");
	return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

export function HydrationPanel({
	deadline,
	pausedRemaining,
	due,
	onConfirm,
	onSnooze,
	onStart,
	onResume,
	onPause,
}: {
	deadline: number | null;
	pausedRemaining: number | null;
	due: boolean;
	onConfirm: () => void;
	onSnooze: () => void;
	onStart: () => void;
	onResume: () => void;
	onPause: () => void;
}) {
	const t = useT();
	const now = useNow(1000, !!deadline && !due);
	const running = !!deadline && !due;
	const paused = pausedRemaining !== null;
	const pausedLabel = pausedRemaining === null ? null : remainingLabel(Date.now() + pausedRemaining, Date.now());

	return (
		<div
			className="group flex h-full items-center gap-3.5 px-2.5"
			data-due={due || undefined}
			onClick={(e) => e.stopPropagation()}
		>
			<span className="grid size-11.5 flex-none place-items-center rounded-2xl bg-[rgba(69,196,230,0.14)] text-[#82ddf3] group-data-due:bg-[#2ea9cc] group-data-due:text-white">
				<DropletIcon size={21} />
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<SectionLabel size="sm">
					{due ? t("hydration.reminder") : paused ? t("hydration.paused") : t("hydration.next")}
				</SectionLabel>
				<strong className="text-[18px]/[1.2] tabular-nums">
					{due
						? t("hydration.titleDue")
						: running
							? remainingLabel(deadline, now)
							: (pausedLabel ?? t("hydration.paused"))}
				</strong>
				<span className="truncate text-[12px] text-text-dim">
					{due ? t("hydration.message") : paused ? t("hydration.pausedStatus") : t("hydration.status")}
				</span>
			</div>
			<div className="flex flex-none gap-1.75">
				{due ? (
					<>
						<button type="button" className={secondary} onClick={() => onSnooze()}>
							{t("hydration.snooze.action")}
						</button>
						<button type="button" className={primary} onClick={() => onConfirm()}>
							{t("hydration.confirm")}
						</button>
					</>
				) : running ? (
					<button type="button" className={secondary} onClick={() => onPause()}>
						{t("hydration.pause")}
					</button>
				) : paused ? (
					<>
						<button type="button" className={secondary} onClick={() => onStart()}>
							{t("hydration.reset")}
						</button>
						<button type="button" className={primary} onClick={() => onResume()}>
							{t("hydration.resume")}
						</button>
					</>
				) : (
					<button type="button" className={primary} onClick={() => onStart()}>
						{t("hydration.start")}
					</button>
				)}
			</div>
		</div>
	);
}

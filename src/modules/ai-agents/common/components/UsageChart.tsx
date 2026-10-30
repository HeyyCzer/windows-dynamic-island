import { SectionLabel } from "../../../../components/ui/text";
import { cn } from "../../../../core/cn";
import { useLocale, useT } from "../../../../core/i18n";
import { formatTokens } from "../format";
import type { UsageHistory } from "../types";

const MAX_BAR = 34;

/**
 * Tokens per day for the last 7 days: one hue (the agent's), today at full
 * strength, earlier days softer; the exact numbers in each column's tooltip.
 * Beside it, the totals for the week and the last 5 hours (today's are in
 * the agent card above).
 */
export function UsageChart({ usage, color }: { usage: UsageHistory; color: string }) {
	const t = useT();
	const locale = useLocale();
	const days = usage.daily;
	if (!days.length) return null;
	const peak = Math.max(1, ...days.map((d) => d.tokens));
	const week = days.reduce((n, d) => n + d.tokens, 0);
	const weekResponses = days.reduce((n, d) => n + d.responses, 0);
	const dayName = new Intl.DateTimeFormat(locale, { weekday: "short" });
	const fullDate = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "short" });
	const responses = (n: number) => t(n === 1 ? "agents.usage.response" : "agents.usage.responses", { n });

	return (
		<div className="flex items-end gap-4.5 px-0.5 pt-0.5" style={{ "--agent": color } as React.CSSProperties}>
			<div className="flex gap-4.5">
				<Stat label={t("agents.usage.week")} value={formatTokens(week)} sub={responses(weekResponses)} />
				<Stat label={t("agents.usage.last5h")} value={formatTokens(usage.last5hTokens)} />
			</div>
			<div className="flex flex-1 gap-1.5">
				{days.map((d, i) => {
					const isToday = i === days.length - 1;
					// Noon avoids the date shifting across time zones.
					const date = new Date(`${d.date}T12:00:00`);
					const height = d.tokens ? Math.max(4, (MAX_BAR * d.tokens) / peak) : 2;
					return (
						<div
							key={d.date}
							className="flex flex-1 flex-col items-center gap-0.75"
							title={`${fullDate.format(date)}\n${formatTokens(d.tokens)} tokens · ${responses(d.responses)}`}
						>
							<div className="flex h-8.5 items-end">
								<div
									className={cn(
										"w-4.5 rounded-[4px_4px_1px_1px]",
										!d.tokens
											? "bg-white/18"
											: isToday
												? "bg-(--agent)"
												: "bg-[color-mix(in_srgb,var(--agent)_62%,transparent)]",
									)}
									style={{ height }}
								/>
							</div>
							<span className={cn("text-[10px] text-text-faint", isToday && "font-[650] text-text")}>
								{isToday ? t("agents.usage.todayShort") : dayName.format(date).replace(".", "")}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
	return (
		<div className="flex min-w-16 flex-col gap-px">
			<SectionLabel>{label}</SectionLabel>
			<span className="text-[17px] font-[650] tabular-nums">{value}</span>
			{sub && <span className="text-[11px] text-text-faint">{sub}</span>}
		</div>
	);
}

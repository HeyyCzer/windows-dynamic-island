import { AnimatePresence, motion } from "motion/react";
import { cn } from "../../../../core/cn";
import { useT } from "../../../../core/i18n";
import { formatAgo, formatElapsed } from "../format";
import type { AgentSessionRef } from "../types";
import { StatusDot, StatusGlyph } from "./StatusGlyph";

/**
 * "Now" list: every recent session across agents, busiest first. With a
 * single agent the rows show only their state (the card above already says
 * which agent it is); the agent icon comes back when several are listed.
 */
export function SessionList({ items, now, showAgent }: { items: AgentSessionRef[]; now: number; showAgent: boolean }) {
	const t = useT();
	if (!items.length) {
		return <div className="py-1.5 text-[12.5px] text-text-faint">{t("agents.noSessions")}</div>;
	}

	return (
		<ul className="list-none">
			<AnimatePresence initial={false}>
				{items.map(({ agent, session }) => {
					const running = session.status === "working" || session.status === "waiting";
					const time =
						running && session.turnStartedAt
							? formatElapsed(now - session.turnStartedAt)
							: formatAgo(t, session.finishedAt ?? session.lastEventAt, now);
					return (
						<motion.li
							key={`${agent.id}:${session.id}`}
							layout
							className={cn(
								"flex h-7.5 items-center gap-2.5 text-[13px]",
								agent.openSession && session.cwd && "cursor-pointer rounded-lg hover:bg-white/5",
							)}
							title={agent.openSession && session.cwd ? t("agents.openProject") : undefined}
							onClick={(e) => {
								if (!agent.openSession || !session.cwd) return;
								e.stopPropagation();
								agent.openSession(session);
							}}
							initial={{ opacity: 0, y: -6 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, height: 0 }}
							transition={{ type: "spring", stiffness: 400, damping: 32 }}
						>
							{showAgent ? (
								<StatusGlyph agent={agent} status={session.status} size={14} />
							) : (
								<StatusDot status={session.status} color={agent.color} />
							)}
							<span className="font-[650] whitespace-nowrap">{session.title || agent.name}</span>
							<span
								className={cn("min-w-0 flex-1 truncate text-text-dim", session.status === "waiting" && "text-warn")}
								title={detail(session) ?? undefined}
							>
								{/* Busy: what it's doing. Otherwise what it was asked, which tells apart sessions of one project. */}
								{running ? session.activity : (session.prompt ?? session.summary ?? session.activity)}
							</span>
							{session.contextPct != null && (
								<span
									className="rounded-full bg-white/7 px-1.5 py-px text-[11px] text-text-faint"
									title={t("agents.contextUsed")}
								>
									{Math.round(session.contextPct)}%
								</span>
							)}
							<span
								className="min-w-14 text-right text-[12px] font-semibold text-text-faint tabular-nums"
								style={{ color: running ? agent.color : undefined }}
							>
								{time}
							</span>
						</motion.li>
					);
				})}
			</AnimatePresence>
		</ul>
	);
}

/** Tooltip: the prompt and how the reply started. */
function detail(session: AgentSessionRef["session"]) {
	const parts = [session.prompt && `> ${session.prompt}`, session.summary ?? session.activity].filter(Boolean);
	return parts.length ? parts.join("\n\n") : null;
}

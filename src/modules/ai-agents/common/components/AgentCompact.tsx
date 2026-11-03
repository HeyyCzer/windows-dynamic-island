import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { cn } from "../../../../core/cn";
import { useT } from "../../../../core/i18n";
import { useIsland } from "../../../../core/island";
import { formatElapsed, useNow } from "../format";
import type { AgentSessionRef } from "../types";
import { StatusGlyph } from "./StatusGlyph";

/** Left slot of the compact pill: animated agent glyph + what it's doing. */
export function AgentCompactLeft({ hot, busyCount }: { hot: AgentSessionRef; busyCount: number }) {
	const { agent, session } = hot;
	const t = useT();
	const { keepOpen } = useIsland();
	const hold = `agent-icon:${agent.id}`;
	useEffect(() => () => keepOpen(false, hold), [keepOpen, hold]);
	const label =
		session.status === "working"
			? (session.activity ?? t("agents.status.working"))
			: session.status === "waiting" && session.permission
				? // What it asks for ("Allow Bash?").
					t("agents.permission.compact", { tool: session.permission.tool })
				: session.status === "idle"
					? ""
					: session.status === "done" && session.summary
						? // How the reply starts, like Windows Island's "Claude finished" alert.
							session.summary
						: t(`agents.status.${session.status}`);

	return (
		<>
			{agent.openApp ? (
				<button
					type="button"
					data-no-drag
					className="flex shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
					aria-label={agent.name}
					onPointerEnter={() => keepOpen(true, hold)}
					onPointerLeave={() => keepOpen(false, hold)}
					onClick={(event) => event.stopPropagation()}
					onDoubleClick={(event) => {
						event.stopPropagation();
						agent.openApp?.().catch(console.error);
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							agent.openApp?.().catch(console.error);
						}
					}}
				>
					<StatusGlyph agent={agent} status={session.status} size={18} />
				</button>
			) : (
				<StatusGlyph agent={agent} status={session.status} size={18} />
			)}
			<AnimatePresence mode="popLayout" initial={false}>
				<motion.span
					key={label}
					className={cn(
						"max-w-50 truncate text-[12.5px] font-semibold text-text",
						session.status === "waiting" && "text-warn",
						session.status === "done" && "text-ok",
					)}
					initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
					animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
					exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
					transition={{ duration: 0.25 }}
				>
					{label}
				</motion.span>
			</AnimatePresence>
			{busyCount > 1 && (
				<span className="grid h-4 min-w-4 place-items-center rounded-lg bg-white/14 px-1 text-[10px] font-bold">
					{busyCount}
				</span>
			)}
		</>
	);
}

/** Right slot: live turn timer (or final duration when done). */
export function AgentCompactRight({ hot }: { hot: AgentSessionRef }) {
	const { session } = hot;
	const running = session.status === "working" || session.status === "waiting";
	const now = useNow(1000, running);
	if (!session.turnStartedAt) return null;
	const end = running ? now : (session.finishedAt ?? now);

	return (
		<span
			className="text-[12.5px] font-[650] text-text-dim tabular-nums"
			style={{ color: running ? hot.agent.color : undefined }}
		>
			{formatElapsed(end - session.turnStartedAt)}
		</span>
	);
}

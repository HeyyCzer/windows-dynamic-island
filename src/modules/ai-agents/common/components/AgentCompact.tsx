import { AnimatePresence, motion } from "motion/react";
import { cn } from "../../../../core/cn";
import { useT } from "../../../../core/i18n";
import { formatElapsed, useNow } from "../format";
import type { AgentSessionRef } from "../types";
import { StatusGlyph } from "./StatusGlyph";

/** Left slot of the compact pill: animated agent glyph + what it's doing. */
export function AgentCompactLeft({ hot, busyCount }: { hot: AgentSessionRef; busyCount: number }) {
	const { agent, session } = hot;
	const t = useT();
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
			<StatusGlyph agent={agent} status={session.status} size={18} />
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

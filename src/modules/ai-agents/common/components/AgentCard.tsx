import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { command } from "../../../../core/bridge";
import { useT } from "../../../../core/i18n";
import { formatTokens } from "../format";
import type { AgentDefinition, AgentSnapshot } from "../types";
import { LimitBar } from "./LimitBar";

const LIMITS_REFRESH_MS = 2 * 60_000;

/** One agent's summary: plan limits on the left, today's tokens on the right. */
export function AgentCard({ agent, snapshot, now }: { agent: AgentDefinition; snapshot: AgentSnapshot; now: number }) {
	const tr = useT();
	const t = snapshot.tokensToday;
	const total = t ? t.input + t.output + t.cacheRead + t.cacheWrite : 0;
	const responses = snapshot.usage?.daily.at(-1)?.responses ?? t?.messages;

	// The card is only mounted while the panel is visible.
	const { refreshLimits } = snapshot;
	useEffect(() => {
		if (!refreshLimits) return;
		refreshLimits();
		const id = setInterval(refreshLimits, LIMITS_REFRESH_MS);
		return () => clearInterval(id);
	}, [refreshLimits]);

	return (
		<div className="grid grid-cols-[1.35fr_1fr] gap-3" style={{ "--agent": agent.color } as React.CSSProperties}>
			<div className="flex flex-col rounded-[20px] bg-card px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--hairline)] gap-2.5">
				<div className="flex items-center gap-2 text-(--agent)">
					<agent.Icon size={18} />
					<span className="text-[15px] font-[650] text-text">{agent.name}</span>
					{snapshot.model && (
						<span className="ml-auto rounded-full bg-[color-mix(in_srgb,var(--agent)_18%,transparent)] px-2 py-0.5 text-[11px] font-[650] text-(--agent)">
							{snapshot.model}
						</span>
					)}
				</div>
				{snapshot.limits.length ? (
					<button
						type="button"
						className="-m-1.5 flex w-[calc(100%+12px)] flex-col gap-2.5 rounded-[10px] p-1.5 text-left transition-[background] duration-200 enabled:hover:bg-white/5 disabled:cursor-default"
						disabled={!agent.usageUrl}
						onClick={(e) => {
							e.stopPropagation();
							if (agent.usageUrl) command("open_external", { url: agent.usageUrl });
						}}
					>
						{snapshot.limits.map((l) => (
							<LimitBar key={l.id} limit={l} color={agent.color} now={now} />
						))}
					</button>
				) : (
					<p className="text-[12px] text-text-faint">{snapshot.limitsHint ?? tr("agents.noLimits")}</p>
				)}
				{snapshot.setup && <SetupButton setup={snapshot.setup} color={agent.color} />}
			</div>

			<div className="flex flex-col rounded-[20px] bg-card px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--hairline)] gap-1">
				<span className="text-[11px] font-bold tracking-[0.06em] text-text-faint uppercase">
					{tr("agents.tokensToday")}
				</span>
				<motion.span
					key={formatTokens(total)}
					className="text-[30px] font-bold tracking-[-0.02em] tabular-nums"
					initial={{ opacity: 0.4 }}
					animate={{ opacity: 1 }}
				>
					{formatTokens(total)}
				</motion.span>
				{responses != null && (
					<span className="text-[11px] text-text-faint">
						{tr(responses === 1 ? "agents.usage.response" : "agents.usage.responses", { n: responses })}
					</span>
				)}
				{t && (
					<dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-[11.5px] [&_dd]:text-right [&_dd]:text-text-dim [&_dd]:tabular-nums [&_dt]:text-text-faint">
						<dt>{tr("agents.tokens.input")}</dt>
						<dd>{formatTokens(t.input)}</dd>
						<dt>{tr("agents.tokens.output")}</dt>
						<dd>{formatTokens(t.output)}</dd>
						<dt>{tr("agents.tokens.cacheRead")}</dt>
						<dd>{formatTokens(t.cacheRead)}</dd>
						<dt>{tr("agents.tokens.cacheWrite")}</dt>
						<dd>{formatTokens(t.cacheWrite)}</dd>
					</dl>
				)}
			</div>
		</div>
	);
}

function SetupButton({ setup, color }: { setup: NonNullable<AgentSnapshot["setup"]>; color: string }) {
	const t = useT();
	const [state, setState] = useState<"idle" | "busy" | "error">("idle");
	return (
		<div>
			<p className="mb-2 text-[11.5px]/[1.4] text-text-dim">{setup.message}</p>
			<motion.button
				className="h-7 rounded-[14px] px-3.5 text-[12px] font-bold text-white disabled:opacity-60"
				style={{ background: color }}
				whileTap={{ scale: 0.94 }}
				disabled={state === "busy"}
				onClick={async (e) => {
					e.stopPropagation();
					setState("busy");
					try {
						await setup.action();
						setState("idle");
					} catch {
						setState("error");
					}
				}}
			>
				{state === "busy" ? t("agents.setup.busy") : state === "error" ? t("agents.setup.failed") : setup.actionLabel}
			</motion.button>
		</div>
	);
}

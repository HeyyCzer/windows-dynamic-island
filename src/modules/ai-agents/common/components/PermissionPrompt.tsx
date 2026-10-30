import { useState } from "react";
import { useT } from "../../../../core/i18n";
import { formatAgo } from "../format";
import type { AgentSessionRef, PermissionDecision } from "../types";
import { StatusGlyph } from "./StatusGlyph";

/**
 * A permission request answered from the island: what the agent wants to do
 * and Allow / Always / Deny. Answering in the terminal or the editor still
 * works; the request then just goes away.
 */
export function PermissionPrompt({ item, now, more }: { item: AgentSessionRef; now: number; more: number }) {
	const t = useT();
	const { agent, session } = item;
	// biome-ignore lint/style/noNonNullAssertion: only rendered for sessions with a pending permission
	const request = session.permission!;
	const [busy, setBusy] = useState<PermissionDecision | null>(null);
	const [error, setError] = useState<string | null>(null);

	const decide = async (decision: PermissionDecision) => {
		if (!agent.decide) return;
		setBusy(decision);
		setError(null);
		try {
			await agent.decide(session, decision);
		} catch (e) {
			setError(String(e));
			setBusy(null);
		}
	};

	return (
		<div
			className="flex flex-col gap-2.5 rounded-[20px] bg-card px-4 py-3.5 shadow-[inset_0_0_0_1px_rgba(255,189,46,0.35)]"
			style={{ "--agent": agent.color } as React.CSSProperties}
		>
			<div className="flex min-w-0 items-center gap-2">
				<StatusGlyph agent={agent} status="waiting" size={16} />
				<span className="min-w-0 flex-1 truncate text-[14px] font-[650]">
					{t("agents.permission.title", { project: session.title || agent.name, tool: request.tool })}
				</span>
				{more > 0 && (
					<span className="flex-none rounded-full bg-[rgba(255,189,46,0.16)] px-2 py-px text-[11px] font-bold text-warn">
						{t("agents.permission.more", { n: more })}
					</span>
				)}
				<span className="flex-none text-[11px] text-text-faint">{formatAgo(t, request.since, now)}</span>
			</div>
			{request.detail && (
				<pre
					className="max-h-13 overflow-y-auto rounded-[10px] bg-black/35 px-2.5 py-2 font-[Cascadia_Code,Consolas,monospace] text-[11.5px]/[1.45] break-all whitespace-pre-wrap text-text [scrollbar-width:none]"
					data-scroll
				>
					{request.detail}
				</pre>
			)}
			<div className="flex items-center gap-2">
				<button
					type="button"
					className="h-7 rounded-[14px] px-3.5 text-[12px] font-bold transition-[filter,background] duration-150 disabled:opacity-55 bg-(--agent) text-white enabled:hover:brightness-112"
					disabled={!!busy}
					onClick={() => decide("allow")}
				>
					{busy === "allow" ? "…" : t("agents.permission.allow")}
				</button>
				{request.always && (
					<button
						type="button"
						className="h-7 rounded-[14px] px-3.5 text-[12px] font-bold transition-[filter,background] duration-150 disabled:opacity-55 bg-white/10 text-text enabled:hover:bg-white/18"
						disabled={!!busy}
						title={t("agents.permission.alwaysTitle", { rule: request.always })}
						onClick={() => decide("always")}
					>
						{busy === "always" ? "…" : t("agents.permission.always")}
					</button>
				)}
				<button
					type="button"
					className="h-7 rounded-[14px] px-3.5 text-[12px] font-bold transition-[filter,background] duration-150 disabled:opacity-55 text-[#ff453a] enabled:hover:bg-[rgba(255,69,58,0.14)]"
					disabled={!!busy}
					onClick={() => decide("deny")}
				>
					{busy === "deny" ? "…" : t("agents.permission.deny")}
				</button>
				{error ? (
					<span className="ml-auto truncate text-[11px] text-[#ff453a]">{error}</span>
				) : (
					<span className="ml-auto truncate text-[11px] text-text-faint">{t("agents.permission.hint")}</span>
				)}
			</div>
		</div>
	);
}

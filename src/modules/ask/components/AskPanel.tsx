import { ArrowUpIcon, CameraIcon, FolderIcon } from "lucide-react";
import { motion } from "motion/react";
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconButton, TextButton } from "../../../components/ui/button";
import { command, providerAction } from "../../../core/bridge";
import { cn } from "../../../core/cn";
import { type Translate, useT } from "../../../core/i18n";
import { useIsland } from "../../../core/island";
import { useShortcutKeys } from "../../../core/shortcuts";
import { ClaudeIcon } from "../../ai-agents/claude/ClaudeIcon";
import {
	ASK_PROVIDER,
	type AskState,
	type Attachment,
	addAttachments,
	CLAUDE_ORANGE,
	draftRequest,
	focusRequest,
	pendingAttachments,
} from "../store";
import { Formatted } from "./Formatted";

const userBubble =
	"flex max-w-85 flex-col gap-1.5 self-end rounded-[15px] bg-[#2c2c2e] px-3 py-1.75 text-[13px] whitespace-pre-wrap";

/** "Ask Claude": a conversation with Claude Code (headless) inside the island. */
export function AskPanel({ state }: { state: AskState | undefined }) {
	const t = useT();
	const hotkey = useShortcutKeys("ask");
	const island = useIsland();
	const attachments = pendingAttachments.use();
	const focusPending = focusRequest.use();
	const [draft, setDraft] = useState("");
	const [copied, setCopied] = useState(false);
	const input = useRef<HTMLTextAreaElement>(null);
	const scroller = useRef<HTMLDivElement>(null);
	const messages = state?.messages ?? [];
	const running = !!state?.running;

	// On screen: no "Claude answered" alert, and the answer counts as read.
	// biome-ignore lint/correctness/useExhaustiveDependencies: mount/unmount only
	useEffect(() => {
		providerAction(ASK_PROVIDER, "viewing", true);
		return () => {
			providerAction(ASK_PROVIDER, "viewing", false);
			island.keepOpen(false);
		};
	}, []);

	// Global shortcut / "ask about this file": take the keyboard.
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs only when a focus request arrives
	useEffect(() => {
		if (!focusPending) return;
		focusRequest.set(false);
		takeKeyboard();
	}, [focusPending]);

	// "Ask about this text" (clipboard): the text goes in, the question follows it.
	const draftPending = draftRequest.use();
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs only when a draft request arrives
	useEffect(() => {
		// Read from the store, not the render: consumed once even if the effect runs twice.
		const text = draftRequest.get();
		if (text == null) return;
		draftRequest.set(null);
		setDraft((prev) => `${prev.trim() ? `${prev.trimEnd()}\n\n` : ""}${text}\n\n`);
		takeKeyboard();
	}, [draftPending]);

	// Follow the newest text.
	const last = messages[messages.length - 1];
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll down whenever a message is added or streams more text
	useLayoutEffect(() => {
		const el = scroller.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messages.length, last?.text]);

	// The textarea grows with the question.
	// biome-ignore lint/correctness/useExhaustiveDependencies: resize whenever the draft changes
	useLayoutEffect(() => {
		const el = input.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
	}, [draft]);

	function takeKeyboard() {
		island.keepOpen(true);
		command("focus_island");
		window.setTimeout(() => input.current?.focus(), 30);
	}

	function send() {
		if (running || (!draft.trim() && !attachments.length)) return;
		providerAction(ASK_PROVIDER, "send", { text: draft, attachments });
		setDraft("");
		pendingAttachments.set([]);
		setCopied(false);
	}

	function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			// Enter sends; Shift+Enter breaks the line.
			e.preventDefault();
			send();
		} else if (e.key === "Escape") {
			// Back to the app you were in; Claude keeps answering meanwhile.
			e.preventDefault();
			input.current?.blur();
			command("restore_focus");
			island.collapse();
		}
	}

	async function screenshot() {
		const shot = await providerAction<Attachment>(ASK_PROVIDER, "screenshot").catch(() => undefined);
		if (shot) addAttachments([shot]);
		takeKeyboard();
	}

	if (state && !state.available) {
		return (
			<div className="flex h-full flex-col gap-2">
				<div className="m-auto max-w-105 text-center text-[12.5px]/[1.45] text-text-dim">{t("ask.notFound")}</div>
			</div>
		);
	}

	const lastAnswer = !running && last && !last.fromUser && !last.error && last.text ? last.text : null;

	return (
		<div className="flex h-full flex-col gap-2" onClick={(e) => e.stopPropagation()}>
			<div className="flex items-center gap-2">
				<motion.span
					className="grid text-[#d97757]"
					animate={running ? { rotate: 360 } : { rotate: 0 }}
					transition={running ? { duration: 2.4, repeat: Infinity, ease: "linear" } : { duration: 0.3 }}
				>
					<ClaudeIcon size={16} />
				</motion.span>
				<span className="text-[14px] font-[650]">Claude</span>
				{running && state?.status && <span className="text-[12px] text-text-dim">{statusText(t, state.status)}</span>}
				<span className="flex-1" />
				{messages.length > 0 && !running && (
					<TextButton onClick={() => providerAction(ASK_PROVIDER, "new")}>{t("ask.new")}</TextButton>
				)}
			</div>

			{messages.length === 0 ? (
				<p className="text-[12.5px]/[1.45] text-text-dim">
					{t("ask.hint")} {hotkey && t("ask.hotkey", { keys: hotkey })}
				</p>
			) : (
				<div
					className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1 select-text [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/14"
					ref={scroller}
					data-scroll
				>
					{messages.map((m, i) =>
						m.fromUser ? (
							// biome-ignore lint/suspicious/noArrayIndexKey: messages are append-only and have no id
							<div key={i} className={userBubble}>
								{m.attachments.map((a) =>
									a.isImage && a.thumb ? (
										<img key={a.path} className="max-h-22.5 rounded-lg object-cover" src={a.thumb} alt="" />
									) : (
										<span key={a.path} className="text-[12px] text-text-dim">
											📎 {a.label ?? a.name}
										</span>
									),
								)}
								<span>{m.text}</span>
							</div>
						) : (
							// biome-ignore lint/suspicious/noArrayIndexKey: messages are append-only and have no id
							<div key={i} className={cn("text-[13px]/normal text-white/92", m.error && "text-[#ff8a80]")}>
								{m.text ? (
									<Formatted text={m.text} />
								) : running && i === messages.length - 1 ? (
									<span className="text-text-dim">…</span>
								) : null}
							</div>
						),
					)}
					{lastAnswer && (
						<TextButton
							className="-ml-2 self-start"
							onClick={() => {
								navigator.clipboard.writeText(lastAnswer).then(() => setCopied(true));
							}}
						>
							{copied ? t("ask.copied") : t("ask.copy")}
						</TextButton>
					)}
				</div>
			)}

			{attachments.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{attachments.map((a) => (
						<span
							key={a.path}
							className="flex max-w-60 items-center gap-1.75 rounded-[10px] bg-[#2c2c2e] p-[3px_4px] text-[12px]"
							title={a.path}
						>
							{a.thumb ? (
								<img src={a.thumb} alt="" className="size-6 rounded-md object-cover" />
							) : (
								<FolderIcon size={13} />
							)}
							<span className="min-w-0 truncate">{a.label ?? a.name}</span>
							<button
								type="button"
								className="size-4.5 rounded-full text-text-faint hover:bg-white/10 hover:text-text"
								title={t("ask.remove")}
								onClick={() => pendingAttachments.set((prev) => prev.filter((p) => p.path !== a.path))}
							>
								×
							</button>
						</span>
					))}
				</div>
			)}

			<div className="flex items-end gap-1.5 rounded-[18px] bg-white/7 p-1.25" data-no-drag>
				<IconButton title={t("ask.screenshot")} onClick={screenshot}>
					<CameraIcon size={14} />
				</IconButton>
				<textarea
					ref={input}
					rows={1}
					className="min-h-6.5 flex-1 resize-none bg-transparent p-1 text-[13px]/[18px] text-text outline-none select-text placeholder:text-text-faint"
					value={draft}
					placeholder={t("ask.placeholder")}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={onKeyDown}
					onMouseDown={takeKeyboard}
					onFocus={() => island.keepOpen(true)}
					onBlur={() => island.keepOpen(false)}
				/>
				<button
					type="button"
					className="grid size-7 flex-none place-items-center rounded-full text-white disabled:opacity-35"
					style={{ background: CLAUDE_ORANGE }}
					title={running ? t("ask.stop") : t("ask.send")}
					disabled={!running && !draft.trim() && !attachments.length}
					onClick={() => (running ? providerAction(ASK_PROVIDER, "cancel") : send())}
				>
					{running ? <span className="size-2.25 rounded-[2px] bg-white" /> : <ArrowUpIcon size={13} />}
				</button>
			</div>
		</div>
	);
}

export function statusText(t: Translate, status: NonNullable<AskState["status"]>) {
	if (status.kind !== "tool") return t(`ask.status.${status.kind}`);
	switch (status.arg) {
		case "WebSearch":
			return t("ask.status.webSearch");
		case "WebFetch":
			return t("ask.status.webFetch");
		case "Read":
			return t("ask.status.read");
		case "Glob":
		case "Grep":
			return t("ask.status.search");
		default:
			return t("ask.status.tool", { tool: status.arg ?? "" });
	}
}

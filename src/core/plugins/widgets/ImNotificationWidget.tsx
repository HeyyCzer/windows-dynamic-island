import { BellIcon, BellOffIcon, CheckCheckIcon, ExternalLinkIcon, SendIcon, Trash2Icon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { command } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { useIsland } from "../../../core/island";
import { dispatchQuickReply, type ImMessage, INITIAL_IM_MESSAGES, openQQ, openWeChat } from "../imClient";

export function WeChatIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
	return (
		<svg
			role="img"
			viewBox="0 0 24 24"
			width={size}
			height={size}
			fill="currentColor"
			className={className}
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>WeChat</title>
			<path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" />
		</svg>
	);
}

export function QqIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
	return (
		<svg
			role="img"
			viewBox="0 0 24 24"
			width={size}
			height={size}
			fill="currentColor"
			className={className}
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>QQ</title>
			<path d="M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673" />
		</svg>
	);
}

export function ImNotificationWidget({ settings }: { settings: Record<string, unknown> }) {
	const t = useT();
	const island = useIsland();

	const [messages, setMessages] = useState<ImMessage[]>(INITIAL_IM_MESSAGES);
	const [filter, setFilter] = useState<"all" | "wechat" | "qq">("all");
	const [dnd, setDnd] = useState(Boolean(settings.dndMode || false));
	const [replyText, setReplyText] = useState("");
	const [targetApp, setTargetApp] = useState<"wechat" | "qq">("wechat");
	const [repliedSuccess, setRepliedSuccess] = useState(false);

	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		return () => {
			island.keepOpen(false, "im-notifications");
		};
	}, [island]);

	const unreadCount = messages.filter((m) => m.unread).length;
	const filteredMessages = messages.filter((m) => filter === "all" || m.app === filter);

	const handleMarkAllRead = (e?: React.MouseEvent) => {
		e?.stopPropagation();
		setMessages((prev) => prev.map((m) => ({ ...m, unread: false })));
	};

	const handleClear = (e?: React.MouseEvent) => {
		e?.stopPropagation();
		setMessages([]);
	};

	const handleSendReply = (e: React.FormEvent) => {
		e.preventDefault();
		if (!replyText.trim()) return;

		dispatchQuickReply(targetApp, replyText.trim());
		setRepliedSuccess(true);
		setReplyText("");
		setTimeout(() => setRepliedSuccess(false), 2200);
	};

	const formatAgo = (timestamp: number) => {
		const diffMin = Math.max(1, Math.floor((Date.now() - timestamp) / 60_000));
		if (diffMin < 60) return `${diffMin}m前`;
		return `${Math.floor(diffMin / 60)}h前`;
	};

	return (
		<div className="flex h-full items-stretch gap-3 select-none px-1 py-0.5">
			{/* Left Column: Dual App Hero + Quick Launch */}
			<div className="flex w-[195px] shrink-0 flex-col justify-between border-r border-white/8 pr-3">
				{/* Header: Dual WeChat & QQ Badges */}
				<div className="flex items-center gap-2.5">
					<div className="flex -space-x-2 shrink-0">
						<motion.div
							whileHover={{ scale: 1.1, zIndex: 10 }}
							className="flex size-8 items-center justify-center rounded-2xl bg-[#07C160]/20 text-[#07C160] p-1.5 shadow-sm border border-[#07C160]/30"
						>
							<WeChatIcon size={16} />
						</motion.div>
						<motion.div
							whileHover={{ scale: 1.1, zIndex: 10 }}
							className="flex size-8 items-center justify-center rounded-2xl bg-[#12B7F5]/20 text-[#12B7F5] p-1.5 shadow-sm border border-[#12B7F5]/30"
						>
							<QqIcon size={16} />
						</motion.div>
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5">
							<span className="truncate font-semibold text-text text-[13px]">{t("marketplace.widgets.im.title")}</span>
							{unreadCount > 0 && (
								<span className="rounded-full bg-red-500 px-1.5 py-0.1 text-[9px] font-bold text-white tabular-nums">
									{unreadCount}
								</span>
							)}
						</div>
						<span className="truncate text-[10.5px] text-text-faint font-mono block">
							{t("marketplace.widgets.im.connectedDual")}
						</span>
					</div>
				</div>

				{/* 1-Click Launch Buttons: WeChat & QQ */}
				<div className="flex flex-col gap-1.5">
					<motion.button
						type="button"
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.98 }}
						onClick={() => openWeChat()}
						className="flex items-center justify-between rounded-xl bg-[#07C160]/15 border border-[#07C160]/25 px-2.5 py-1.5 text-xs text-[#07C160] hover:bg-[#07C160]/22 transition-colors cursor-pointer"
					>
						<div className="flex items-center gap-1.5">
							<WeChatIcon size={13} />
							<span className="font-medium text-[11px]">{t("marketplace.widgets.im.openWeChat")}</span>
						</div>
						<ExternalLinkIcon size={11} className="opacity-70" />
					</motion.button>

					<motion.button
						type="button"
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.98 }}
						onClick={() => openQQ()}
						className="flex items-center justify-between rounded-xl bg-[#12B7F5]/15 border border-[#12B7F5]/25 px-2.5 py-1.5 text-xs text-[#12B7F5] hover:bg-[#12B7F5]/22 transition-colors cursor-pointer"
					>
						<div className="flex items-center gap-1.5">
							<QqIcon size={13} />
							<span className="font-medium text-[11px]">{t("marketplace.widgets.im.openQQ")}</span>
						</div>
						<ExternalLinkIcon size={11} className="opacity-70" />
					</motion.button>
				</div>

				{/* DND Toggle & Clean Footer */}
				<div className="flex items-center justify-between text-[10px] text-text-faint border-t border-white/5 pt-1">
					<button
						type="button"
						onClick={() => setDnd(!dnd)}
						className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-colors ${
							dnd ? "bg-amber-500/20 text-amber-300" : "hover:text-text"
						}`}
					>
						{dnd ? <BellOffIcon size={11} /> : <BellIcon size={11} />}
						<span>{dnd ? t("marketplace.widgets.im.dndActive") : t("marketplace.widgets.im.dndNormal")}</span>
					</button>

					{unreadCount > 0 && (
						<button
							type="button"
							onClick={handleMarkAllRead}
							className="text-[10px] text-text-muted hover:text-text transition-colors cursor-pointer flex items-center gap-0.5"
						>
							<CheckCheckIcon size={11} />
							<span>{t("marketplace.widgets.im.markRead")}</span>
						</button>
					)}
				</div>
			</div>

			{/* Right Column: Filter Tabs, Notification Stream, Quick Reply */}
			<div className="flex flex-1 min-w-0 flex-col justify-between">
				{/* Top Bar: Filter Tabs & Clear */}
				<div className="flex items-center justify-between border-b border-white/8 pb-1">
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={() => setFilter("all")}
							className={`rounded-lg px-2 py-0.5 text-xs font-medium transition-colors ${
								filter === "all" ? "bg-white/12 text-white border border-white/20" : "text-text-faint hover:text-text"
							}`}
						>
							{t("marketplace.widgets.im.filterAll")}
						</button>
						<button
							type="button"
							onClick={() => setFilter("wechat")}
							className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium transition-colors ${
								filter === "wechat"
									? "bg-[#07C160]/20 text-[#07C160] border border-[#07C160]/30"
									: "text-text-faint hover:text-text"
							}`}
						>
							<WeChatIcon size={11} />
							<span>微信</span>
						</button>
						<button
							type="button"
							onClick={() => setFilter("qq")}
							className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium transition-colors ${
								filter === "qq"
									? "bg-[#12B7F5]/20 text-[#12B7F5] border border-[#12B7F5]/30"
									: "text-text-faint hover:text-text"
							}`}
						>
							<QqIcon size={11} />
							<span>QQ</span>
						</button>
					</div>

					{messages.length > 0 && (
						<button
							type="button"
							onClick={handleClear}
							className="rounded-full p-1 text-text-faint hover:text-red-400 transition-colors"
							title={t("marketplace.widgets.im.clearAll")}
						>
							<Trash2Icon size={12} />
						</button>
					)}
				</div>

				{/* Middle: Top 2-3 Recent Messages */}
				<div className="flex flex-col gap-1 min-h-0 py-0.5">
					{filteredMessages.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-2.5 gap-2">
							<span className="text-xs text-text-faint">暂无未读消息 · 微信与 QQ 桌面客户端已就绪</span>
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={openWeChat}
									className="flex items-center gap-1.5 rounded-full bg-[#07C160]/15 hover:bg-[#07C160]/25 text-[#07C160] px-3 py-1 text-[11px] font-semibold transition-colors"
								>
									<WeChatIcon size={12} />
									<span>打开微信</span>
								</button>
								<button
									type="button"
									onClick={openQQ}
									className="flex items-center gap-1.5 rounded-full bg-[#12B7F5]/15 hover:bg-[#12B7F5]/25 text-[#12B7F5] px-3 py-1 text-[11px] font-semibold transition-colors"
								>
									<QqIcon size={12} />
									<span>打开 QQ</span>
								</button>
							</div>
						</div>
					) : (
						filteredMessages.slice(0, 2).map((msg) => (
							<motion.div
								key={msg.id}
								whileHover={{ backgroundColor: "rgba(255, 255, 255, 0.08)" }}
								onClick={() => (msg.app === "wechat" ? openWeChat() : openQQ())}
								className={`group flex items-center justify-between rounded-xl px-2.5 py-1 text-xs cursor-pointer border transition-colors ${
									msg.unread ? "bg-white/6 border-white/12" : "bg-white/3 border-white/5 opacity-85"
								}`}
							>
								{/* Left: App Icon + Sender + Snippet */}
								<div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
									<div
										className="flex size-6 shrink-0 items-center justify-center rounded-lg shadow-sm"
										style={{ backgroundColor: `${msg.avatarColor}25`, color: msg.avatarColor }}
									>
										{msg.app === "wechat" ? <WeChatIcon size={12} /> : <QqIcon size={12} />}
									</div>
									<div className="flex flex-col min-w-0">
										<div className="flex items-center gap-1.5">
											<span className="truncate font-semibold text-text text-[11.5px]">{msg.sender}</span>
											{msg.group && (
												<span className="truncate text-[9.5px] text-text-faint font-mono bg-white/5 rounded px-1">
													{msg.group}
												</span>
											)}
											{msg.unread && <span className="size-1.5 rounded-full bg-red-500 shrink-0" />}
										</div>
										<span className="truncate text-[10.5px] text-text-muted">{msg.content}</span>
									</div>
								</div>

								{/* Right: Time ago */}
								<span className="text-[9.5px] text-text-faint font-mono shrink-0">{formatAgo(msg.timestamp)}</span>
							</motion.div>
						))
					)}
				</div>

				{/* Bottom: Quick Flash Reply Input with Input Protection */}
				<form
					onSubmit={handleSendReply}
					className="flex items-center gap-1.5 rounded-xl bg-white/5 border border-white/8 focus-within:border-[#07C160]/50 px-2 py-0.8 transition-colors"
					data-no-drag
				>
					{/* Target app pill toggle */}
					<button
						type="button"
						onClick={() => setTargetApp(targetApp === "wechat" ? "qq" : "wechat")}
						className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10.5px] font-medium transition-colors shrink-0"
						style={{
							backgroundColor: targetApp === "wechat" ? "#07C16025" : "#12B7F525",
							color: targetApp === "wechat" ? "#07C160" : "#12B7F5",
						}}
					>
						{targetApp === "wechat" ? <WeChatIcon size={11} /> : <QqIcon size={11} />}
						<span>{targetApp === "wechat" ? "微信" : "QQ"}</span>
					</button>

					<input
						ref={inputRef}
						type="text"
						value={replyText}
						onChange={(e) => setReplyText(e.target.value)}
						onFocus={() => island.keepOpen(true, "im-notifications")}
						onBlur={() => island.keepOpen(false, "im-notifications")}
						onMouseDown={() => {
							island.keepOpen(true, "im-notifications");
							command("focus_island");
						}}
						placeholder={t("marketplace.widgets.im.replyPlaceholder")}
						className="flex-1 min-w-0 bg-transparent text-[11px] text-text placeholder:text-text-faint focus:outline-none"
					/>

					<AnimatePresence>
						{repliedSuccess && (
							<motion.span
								initial={{ opacity: 0, scale: 0.9 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0 }}
								className="text-[10px] font-medium text-emerald-400 shrink-0"
							>
								✓ {t("marketplace.widgets.im.copiedAndOpened")}
							</motion.span>
						)}
					</AnimatePresence>

					<motion.button
						type="submit"
						whileHover={{ scale: 1.08 }}
						whileTap={{ scale: 0.92 }}
						disabled={!replyText.trim()}
						className="flex items-center gap-0.5 rounded-lg px-2 py-0.6 text-[10.5px] font-medium text-white shadow disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
						style={{
							backgroundColor: targetApp === "wechat" ? "#07C160" : "#12B7F5",
						}}
					>
						<SendIcon size={10} />
						<span>{t("marketplace.widgets.im.btnReply")}</span>
					</motion.button>
				</form>
			</div>
		</div>
	);
}

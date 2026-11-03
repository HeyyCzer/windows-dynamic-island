/**
 * WeChat & QQ desktop notifications and launcher client for Windows Dynamic Island.
 */
import { openExternal } from "../bridge";

export interface ImMessage {
	id: string;
	app: "wechat" | "qq";
	sender: string;
	group?: string;
	content: string;
	timestamp: number;
	unread: boolean;
	avatarColor: string;
}

export const INITIAL_IM_MESSAGES: ImMessage[] = [];

export function openWeChat() {
	openExternal("weixin://");
}

export function openQQ() {
	openExternal("tencent://");
}

export function dispatchQuickReply(app: "wechat" | "qq", text: string) {
	if (!text.trim()) return;
	if (navigator.clipboard) {
		navigator.clipboard.writeText(text.trim());
	}
	if (app === "wechat") {
		openWeChat();
	} else {
		openQQ();
	}
}

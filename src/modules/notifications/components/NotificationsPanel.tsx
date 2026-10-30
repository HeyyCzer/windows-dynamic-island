import { useEffect } from "react";
import { Badge } from "../../../components/Glyph";
import { TextButton } from "../../../components/ui/button";
import { Empty, SectionLabel } from "../../../components/ui/text";
import { providerAction } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { formatAgo, useNow } from "../../ai-agents/common/format";
import { NOTIFICATION_BLUE, NOTIFICATIONS_PROVIDER, type NotificationsState } from "../types";

const MAX_ROWS = 4;

/** Latest notifications; click one to open the app that sent it. */
export function NotificationsPanel({ state }: { state: NotificationsState | undefined }) {
	const t = useT();
	const now = useNow(30_000);
	const items = state?.items.slice(0, MAX_ROWS) ?? [];
	const unread = state?.items.some((i) => !i.read) ?? false;

	// Looking at the list counts as reading it.
	useEffect(() => {
		if (unread) providerAction(NOTIFICATIONS_PROVIDER, "markRead");
	}, [unread]);

	return (
		<div className="flex h-full flex-col">
			<div className="mb-1 flex items-center justify-between">
				<SectionLabel>{t("notifications.title")}</SectionLabel>
				{items.length > 0 && (
					<TextButton
						onClick={(e) => {
							e.stopPropagation();
							providerAction(NOTIFICATIONS_PROVIDER, "clear");
						}}
					>
						{t("notifications.clear")}
					</TextButton>
				)}
			</div>
			{items.length === 0 ? (
				<Empty>{t("notifications.empty")}</Empty>
			) : (
				<ul className="flex-1 list-none overflow-y-auto [scrollbar-width:none]" data-scroll>
					{items.map((item) => (
						<li
							key={item.id}
							className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-1.5 hover:bg-white/5"
							title={item.app ? t("notifications.open", { app: item.app }) : undefined}
							onClick={(e) => {
								e.stopPropagation();
								providerAction(NOTIFICATIONS_PROVIDER, "open", item.id);
							}}
						>
							<Badge icon="bell" image={item.logo} color={NOTIFICATION_BLUE} size={32} radius={9} glyphSize={14} />
							<div className="flex min-w-0 flex-1 flex-col">
								{item.app && <span className="text-[11px] font-semibold text-text-faint">{item.app}</span>}
								<span className="truncate text-[13px] font-semibold">{item.title}</span>
								{item.body && <span className="truncate text-[12px] text-text-dim">{item.body}</span>}
							</div>
							<span className="flex-none text-[11px] text-text-faint">{formatAgo(t, item.receivedAt, now)}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

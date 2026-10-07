import { useEffect } from "react";
import { Badge } from "../../../components/Glyph";
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
    <div className="notif-panel">
      <div className="notif-head">
        <span className="notif-heading">{t("notifications.title")}</span>
        {items.length > 0 && (
          <button
            className="notif-clear"
            onClick={(e) => {
              e.stopPropagation();
              providerAction(NOTIFICATIONS_PROVIDER, "clear");
            }}
          >
            {t("notifications.clear")}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="notif-empty">{t("notifications.empty")}</div>
      ) : (
        <ul className="notif-list" data-scroll>
          {items.map((item) => (
            <li
              key={item.id}
              className="notif-row"
              title={item.app ? t("notifications.open", { app: item.app }) : undefined}
              onClick={(e) => {
                e.stopPropagation();
                providerAction(NOTIFICATIONS_PROVIDER, "open", item.id);
              }}
            >
              <Badge icon="bell" image={item.logo} color={NOTIFICATION_BLUE} size={32} radius={9} glyphSize={14} />
              <div className="notif-texts">
                {item.app && <span className="notif-app">{item.app}</span>}
                <span className="notif-title">{item.title}</span>
                {item.body && <span className="notif-body">{item.body}</span>}
              </div>
              <span className="notif-time">{formatAgo(t, item.receivedAt, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

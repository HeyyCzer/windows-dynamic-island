import { useState } from "react";
import { providerAction, useProvider } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { NOTIFICATIONS_PROVIDER, type NotificationsState } from "../types";

/** Access status, and the one-time setup that lets the island read notifications. */
export function NotificationsSettings() {
  const t = useT();
  const state = useProvider<NotificationsState>(NOTIFICATIONS_PROVIDER);
  const [busy, setBusy] = useState(false);
  const access = state?.access ?? "noIdentity";

  return (
    <div className="settings-block">
      <div className="settings-row">
        <div className="settings-text">
          <span className="settings-label">{t("notifications.access.title")}</span>
          <span className="settings-desc">{t(`notifications.access.${access}`)}</span>
        </div>
        {access === "noIdentity" && (
          <button
            className="settings-btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                // Restarts the app on success.
                await providerAction(NOTIFICATIONS_PROVIDER, "enable");
              } catch {
                setBusy(false);
              }
            }}
          >
            {busy ? t("notifications.access.enabling") : t("notifications.access.enable")}
          </button>
        )}
        {access === "denied" && (
          <button className="settings-btn about-btn" onClick={() => providerAction(NOTIFICATIONS_PROVIDER, "openPrivacy")}>
            {t("notifications.access.openPrivacy")}
          </button>
        )}
        {access === "allowed" && (
          <div className="settings-chips">
            <span className="settings-chip ok">{t("notifications.access.on")}</span>
          </div>
        )}
      </div>
      {access === "noIdentity" && <span className="settings-desc">{t("notifications.access.how")}</span>}
      {state?.error && (
        <>
          <span className="settings-error">{state.error}</span>
          <button className="settings-btn about-btn" style={{ alignSelf: "flex-start" }} onClick={() => providerAction(NOTIFICATIONS_PROVIDER, "openDeveloper")}>
            {t("notifications.access.openDeveloper")}
          </button>
        </>
      )}
    </div>
  );
}

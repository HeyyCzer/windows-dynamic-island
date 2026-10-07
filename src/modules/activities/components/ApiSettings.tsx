import { useProvider } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { ACTIVITIES_PROVIDER, type ActivitiesState } from "../types";

/** Where the local API listens, with a ready-to-paste example. */
export function ApiSettings() {
  const t = useT();
  const state = useProvider<ActivitiesState>(ACTIVITIES_PROVIDER);
  const port = state?.apiPort;
  const example = `curl -X POST http://127.0.0.1:${port ?? 5199}/notify -H "Content-Type: application/json" -d "{\\"title\\":\\"Deploy done\\",\\"icon\\":\\"check\\",\\"color\\":\\"#30D158\\"}"`;
  return (
    <div className="settings-block">
      <div className="settings-row">
        <div className="settings-text">
          <span className="settings-label">{t("activities.server.title")}</span>
          <span className="settings-desc">{t("activities.server.desc")}</span>
        </div>
        <div className="settings-chips">
          <span className={`settings-chip ${port ? "ok" : ""}`}>
            {port ? `127.0.0.1:${port}` : t("activities.server.down")}
          </span>
        </div>
      </div>
      <code className="settings-code">{example}</code>
      <span className="settings-desc">{t("activities.server.routes")}</span>
    </div>
  );
}

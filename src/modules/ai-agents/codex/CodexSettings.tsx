import { useProvider } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { PROVIDER, type CodexState } from "./useCodex";

/** Codex needs no setup: just says whether its sessions were found. */
export function CodexSettings() {
  const state = useProvider<Pick<CodexState, "available">>(PROVIDER);
  const t = useT();
  const found = !!state?.available;

  return (
    <div className="settings-block">
      <div className="settings-row">
        <div className="settings-text">
          <span className="settings-label">{t("codex.integration.title")}</span>
          <span className="settings-desc">{t("codex.integration.desc", { dir: "~/.codex/sessions" })}</span>
        </div>
      </div>
      <div className="settings-chips">
        <span className={`settings-chip ${found ? "ok" : ""}`}>
          {found ? t("codex.integration.found") : t("codex.integration.missing")}
        </span>
      </div>
    </div>
  );
}

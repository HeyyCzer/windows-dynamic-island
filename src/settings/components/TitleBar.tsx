import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppLogo } from "../../components/icons";
import { isTauri } from "../../core/bridge";
import { useT } from "../../core/i18n";

/** Custom titlebar: the window is frameless (see `settings.rs`). */
export function TitleBar() {
  const t = useT();
  const win = () => (isTauri ? getCurrentWindow() : null);
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-brand" data-tauri-drag-region>
        <AppLogo className="titlebar-logo" />
        Dynamic Island
        <span className="titlebar-sep">·</span>
        <span className="titlebar-sub">{t("settings.subtitle")}</span>
      </div>
      <div className="titlebar-controls">
        <button type="button" aria-label={t("settings.minimize")} onClick={() => win()?.minimize()}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button type="button" className="close" aria-label={t("settings.close")} onClick={() => win()?.close()}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </header>
  );
}

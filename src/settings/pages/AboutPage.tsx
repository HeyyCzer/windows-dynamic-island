import { useState } from "react";
import { AppLogo, GitHubIcon } from "../../components/icons";
import { command, isTauri } from "../../core/bridge";
import { useT } from "../../core/i18n";

const REPO_URL = "https://github.com/HeyyCzer/windows-dynamic-island";

type UpdateStatus =
  | { state: "idle" | "checking" | "latest" | "dev" | "error" }
  | { state: "ready"; version: string };

/** Manual update check; a found update is downloaded and installed on demand. */
function UpdateRow() {
  const t = useT();
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });

  const check = async () => {
    setStatus({ state: "checking" });
    try {
      const version = await command<string | null>("check_update");
      setStatus(version ? { state: "ready", version } : { state: "latest" });
    } catch (e) {
      setStatus({ state: e === "dev" ? "dev" : "error" });
    }
  };

  const desc =
    status.state === "ready"
      ? t("settings.about.updates.ready", { version: status.version })
      : t(`settings.about.updates.${status.state}`);

  return (
    <div className="settings-row about-row">
      <div className="settings-text">
        <span className="settings-label">{t("settings.about.updates.label")}</span>
        <span className="settings-desc">{desc}</span>
      </div>
      {status.state === "ready" ? (
        <button type="button" className="settings-btn primary" onClick={() => command("install_update")}>
          {t("settings.about.updates.install")}
        </button>
      ) : (
        <button type="button" className="settings-btn about-btn" onClick={check} disabled={status.state === "checking"}>
          {t("settings.about.updates.check")}
        </button>
      )}
    </div>
  );
}

export function AboutPage() {
  const t = useT();
  const openRepo = () => (isTauri ? command("open_repo") : window.open(REPO_URL, "_blank"));

  return (
    <>
      <div className="about-hero">
        <AppLogo size={72} />
        <div className="about-name">Dynamic Island</div>
        <span className="about-version">{t("settings.about.version", { version: __APP_VERSION__ })}</span>
      </div>
      <section className="settings-card">
        <div className="settings-row about-row">
          <div className="settings-text">
            <span className="settings-label">{t("settings.about.source")}</span>
            <span className="settings-desc">{REPO_URL.replace("https://", "")}</span>
          </div>
          <button type="button" className="settings-btn about-btn" onClick={openRepo}>
            <GitHubIcon size={14} />
            GitHub
          </button>
        </div>
        <UpdateRow />
        <div className="settings-row about-row">
          <div className="settings-text">
            <span className="settings-label">{t("settings.about.license")}</span>
            <span className="settings-desc">GNU GPL v3.0</span>
          </div>
        </div>
      </section>
    </>
  );
}

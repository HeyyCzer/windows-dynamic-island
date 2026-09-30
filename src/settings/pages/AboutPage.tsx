import { AppLogo, GitHubIcon } from "../../components/icons";
import { command, isTauri } from "../../core/bridge";
import { useT } from "../../core/i18n";

const REPO_URL = "https://github.com/HeyyCzer/windows-dynamic-island";

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

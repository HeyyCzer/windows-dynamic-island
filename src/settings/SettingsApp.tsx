import { motion } from "motion/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState, type ReactNode } from "react";
import { GearIcon } from "../components/icons";
import { command, isTauri } from "../core/bridge";
import { languageSetting, locales, systemLocale, useSyncLocale, useT, type LanguagePref } from "../core/i18n";
import { generalSettings, moduleEnabled, readSetting, setSetting, useSettings, type SettingDef } from "../core/settings";
import type { IslandModule } from "../core/types";
import { modules } from "../modules";
import "./settings.css";

/** Settings window: frameless, with a sidebar (general + one entry per module). */
export function SettingsApp() {
  const values = useSettings();
  const t = useT();
  useSyncLocale();
  const [page, setPage] = useState("general");
  const module = modules.find((m) => m.id === page);

  return (
    <div className="settings">
      <TitleBar />
      <div className="settings-main">
        <nav className="settings-nav">
          <NavItem icon={<GearIcon size={15} />} label={t("settings.general")} active={!module} onClick={() => setPage("general")} />
          {modules.map((m) => (
            <NavItem
              key={m.id}
              icon={m.settingsIcon}
              label={t(m.title)}
              active={m === module}
              off={!readSetting(values, moduleEnabled(m.id, m.title))}
              onClick={() => setPage(m.id)}
            />
          ))}
        </nav>
        <main className="settings-content">
          <motion.div
            key={page}
            className="settings-page"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {module ? (
              <ModulePage module={module} values={values} />
            ) : (
              <>
                <h1 className="settings-title">{t("settings.general")}</h1>
                <section className="settings-card">
                  <LanguageRow value={readSetting(values, languageSetting)} />
                  <AutostartRow />
                  {Object.values(generalSettings).map((def) => (
                    <ToggleRow key={def.key} def={def} value={readSetting(values, def)} />
                  ))}
                </section>
              </>
            )}
          </motion.div>
        </main>
      </div>
    </div>
  );
}

function TitleBar() {
  const t = useT();
  const win = () => (isTauri ? getCurrentWindow() : null);
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-brand" data-tauri-drag-region>
        <svg className="titlebar-logo" width="16" height="16" viewBox="64 64 896 896" aria-hidden>
          <defs>
            <linearGradient id="tb-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2b2d5c" />
              <stop offset="1" stopColor="#0d0e1c" />
            </linearGradient>
          </defs>
          <rect x="64" y="64" width="896" height="896" rx="220" fill="url(#tb-bg)" />
          <rect x="212" y="400" width="600" height="224" rx="112" fill="#000" stroke="#8f94ff" strokeWidth="24" strokeOpacity=".7" />
          <circle cx="324" cy="512" r="56" fill="#d97757" />
        </svg>
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

function NavItem({
  icon,
  label,
  active,
  off,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  off?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`settings-nav-item ${active ? "active" : ""} ${off ? "off" : ""}`} onClick={onClick}>
      {active && <motion.span layoutId="nav-pill" className="settings-nav-pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
      <span className="settings-nav-icon">{icon}</span>
      <span className="settings-nav-label">{label}</span>
    </button>
  );
}

function ModulePage({ module, values }: { module: IslandModule; values: Record<string, unknown> }) {
  const enabledDef = moduleEnabled(module.id, module.title);
  const enabled = readSetting(values, enabledDef);
  const Section = module.SettingsSection;
  const t = useT();

  return (
    <>
      <h1 className="settings-title">{t(module.title)}</h1>
      <section className="settings-card">
        <label className="settings-row">
          <div className="settings-text">
            <span className="settings-label">{t("settings.module.label")}</span>
            <span className="settings-desc">{t("settings.module.desc")}</span>
          </div>
          <Toggle checked={enabled} onChange={(v) => setSetting(enabledDef, v)} />
        </label>
      </section>
      <motion.div
        className="settings-group"
        initial={false}
        animate={{ opacity: enabled ? 1 : 0.4 }}
        style={{ pointerEvents: enabled ? "auto" : "none" }}
      >
        {!!module.settings?.length && (
          <section className="settings-card">
            {module.settings.map((def) => (
              <ToggleRow key={def.key} def={def} value={readSetting(values, def)} />
            ))}
          </section>
        )}
        {Section && (
          <section className="settings-card">
            <Section />
          </section>
        )}
      </motion.div>
    </>
  );
}

function ToggleRow({ def, value }: { def: SettingDef; value: boolean }) {
  const t = useT();
  return (
    <label className="settings-row">
      <div className="settings-text">
        <span className="settings-label">{t(def.label)}</span>
        {def.description && <span className="settings-desc">{t(def.description)}</span>}
      </div>
      <Toggle checked={value} onChange={(v) => setSetting(def, v)} />
    </label>
  );
}

function LanguageRow({ value }: { value: LanguagePref }) {
  const t = useT();
  const system = locales[systemLocale()].name;
  return (
    <label className="settings-row">
      <div className="settings-text">
        <span className="settings-label">{t("settings.language.label")}</span>
        <span className="settings-desc">{t("settings.language.desc")}</span>
      </div>
      <select
        className="settings-select"
        value={value}
        onChange={(e) => setSetting(languageSetting, e.target.value as LanguagePref)}
      >
        <option value="auto">{t("settings.language.auto", { language: system })}</option>
        {Object.entries(locales).map(([code, { name }]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

function AutostartRow() {
  const t = useT();
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    command<boolean>("get_autostart").then((v) => setOn(!!v));
  }, []);

  return (
    <label className="settings-row">
      <div className="settings-text">
        <span className="settings-label">{t("settings.autostart.label")}</span>
        {!isTauri && <span className="settings-desc">{t("settings.autostart.appOnly")}</span>}
      </div>
      <Toggle
        checked={!!on}
        disabled={on === null}
        onChange={async (v) => {
          setOn(v);
          const result = await command<boolean>("set_autostart", { enabled: v });
          if (typeof result === "boolean") setOn(result);
        }}
      />
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`toggle ${checked ? "on" : ""}`}
      onClick={(e) => {
        e.preventDefault();
        onChange(!checked);
      }}
    >
      <motion.span className="toggle-knob" layout transition={{ type: "spring", stiffness: 600, damping: 32 }} />
    </button>
  );
}

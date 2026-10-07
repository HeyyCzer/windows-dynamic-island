import { useEffect, useState } from "react";
import { command, isTauri } from "../../core/bridge";
import { languageSetting, locales, systemLocale, useT, type LanguagePref } from "../../core/i18n";
import { generalSettings, monitorSettings, positionSettings, readSetting, setSetting } from "../../core/settings";
import { Toggle, ToggleRow } from "../components/Toggle";

export function GeneralPage({ values }: { values: Record<string, unknown> }) {
  const t = useT();
  return (
    <>
      <h1 className="settings-title">{t("settings.general")}</h1>
      <section className="settings-card">
        <LanguageRow value={readSetting(values, languageSetting)} />
        <AutostartRow />
        {Object.values(generalSettings).map((def) => (
          <ToggleRow key={def.key} def={def} value={readSetting(values, def)} />
        ))}
      </section>
      <section className="settings-card">
        <MonitorRow value={readSetting(values, monitorSettings.monitor)} />
        <ToggleRow def={monitorSettings.avoidMaximized} value={readSetting(values, monitorSettings.avoidMaximized)} />
      </section>
      <section className="settings-card">
        <ToggleRow def={positionSettings.returnToCenter} value={readSetting(values, positionSettings.returnToCenter)} />
        <SecondsRow
          value={readSetting(values, positionSettings.returnDelay)}
          disabled={!readSetting(values, positionSettings.returnToCenter)}
        />
      </section>
    </>
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

interface MonitorInfo {
  id: string;
  name: string | null;
  width: number;
  height: number;
  primary: boolean;
}

/** Monitors come from the backend; re-read when the window gets focus (plugged in meanwhile). */
function useMonitors() {
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  useEffect(() => {
    const load = () => command<MonitorInfo[]>("list_monitors").then((list) => setMonitors(list ?? []));
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);
  return monitors;
}

function MonitorRow({ value }: { value: string }) {
  const t = useT();
  const def = monitorSettings.monitor;
  const monitors = useMonitors();
  const nameOf = (m: MonitorInfo) => m.name || t("settings.monitor.generic", { n: monitors.indexOf(m) + 1 });
  const primary = monitors.find((m) => m.primary);
  const missing = value !== "primary" && monitors.length > 0 && !monitors.some((m) => m.id === value);

  return (
    <label className="settings-row">
      <div className="settings-text">
        <span className="settings-label">{t(def.label)}</span>
        <span className="settings-desc">{t(def.description!)}</span>
      </div>
      <select className="settings-select" value={value} onChange={(e) => setSetting(def, e.target.value)}>
        <option value="primary">
          {primary ? t("settings.monitor.auto", { name: nameOf(primary) }) : t("settings.monitor.auto", { name: "—" })}
        </option>
        {monitors.map((m) => (
          <option key={m.id} value={m.id}>
            {`${nameOf(m)} · ${m.width}×${m.height}${m.primary ? ` (${t("settings.monitor.primary")})` : ""}`}
          </option>
        ))}
        {missing && <option value={value}>{t("settings.monitor.missing")}</option>}
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

function SecondsRow({ value, disabled }: { value: number; disabled: boolean }) {
  const t = useT();
  const def = positionSettings.returnDelay;
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(draft));
    if (Number.isFinite(n) && n >= 1 && n <= 3600) setSetting(def, n);
    else setDraft(String(value));
  };

  return (
    <label className={`settings-row ${disabled ? "is-disabled" : ""}`}>
      <div className="settings-text">
        <span className="settings-label">{t(def.label)}</span>
        <span className="settings-desc">{t(def.description)}</span>
      </div>
      <span className="settings-number">
        <input
          type="number"
          min={1}
          max={3600}
          step={1}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <span className="settings-unit">s</span>
      </span>
    </label>
  );
}

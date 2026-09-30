import { useEffect, useState } from "react";
import { command, isTauri } from "../../core/bridge";
import { languageSetting, locales, systemLocale, useT, type LanguagePref } from "../../core/i18n";
import { generalSettings, readSetting, setSetting } from "../../core/settings";
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

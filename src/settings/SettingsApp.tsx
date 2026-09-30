import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { command, isTauri } from "../core/bridge";
import { generalSettings, moduleEnabled, readSetting, setSetting, useSettings, type SettingDef } from "../core/settings";
import type { IslandModule } from "../core/types";
import { modules } from "../modules";
import "./settings.css";

/** Settings window: general options, then one card per module. */
export function SettingsApp() {
  const values = useSettings();

  return (
    <div className="settings">
      <header className="settings-header">
        <h1>Dynamic Island</h1>
        <p>Configurações</p>
      </header>

      <section className="settings-card">
        <h2>Geral</h2>
        <AutostartRow />
        {Object.values(generalSettings).map((def) => (
          <ToggleRow key={def.key} def={def} value={readSetting(values, def)} />
        ))}
      </section>

      {modules.map((module) => (
        <ModuleCard key={module.id} module={module} values={values} />
      ))}
    </div>
  );
}

function ModuleCard({ module, values }: { module: IslandModule; values: Record<string, unknown> }) {
  const enabledDef = moduleEnabled(module.id, module.title);
  const enabled = readSetting(values, enabledDef);
  const Section = module.SettingsSection;

  return (
    <section className={`settings-card ${enabled ? "" : "is-off"}`}>
      <div className="settings-card-head">
        <h2>{module.title}</h2>
        <Toggle checked={enabled} onChange={(v) => setSetting(enabledDef, v)} />
      </div>
      <motion.div
        className="settings-card-body"
        initial={false}
        animate={{ opacity: enabled ? 1 : 0.4 }}
        style={{ pointerEvents: enabled ? "auto" : "none" }}
      >
        {module.settings?.map((def) => (
          <ToggleRow key={def.key} def={def} value={readSetting(values, def)} />
        ))}
        {Section && <Section />}
      </motion.div>
    </section>
  );
}

function ToggleRow({ def, value }: { def: SettingDef; value: boolean }) {
  return (
    <label className="settings-row">
      <div className="settings-text">
        <span className="settings-label">{def.label}</span>
        {def.description && <span className="settings-desc">{def.description}</span>}
      </div>
      <Toggle checked={value} onChange={(v) => setSetting(def, v)} />
    </label>
  );
}

function AutostartRow() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    command<boolean>("get_autostart").then((v) => setOn(!!v));
  }, []);

  return (
    <label className="settings-row">
      <div className="settings-text">
        <span className="settings-label">Iniciar com o Windows</span>
        {!isTauri && <span className="settings-desc">Disponível só no app.</span>}
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

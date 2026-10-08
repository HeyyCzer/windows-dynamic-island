import { motion } from "motion/react";
import { Link, Navigate, useParams } from "react-router";
import { useT } from "../../core/i18n";
import { moduleEnabled, readSetting, setSetting } from "../../core/settings";
import type { IslandModule } from "../../core/types";
import { modules } from "../../modules";
import { PlacementSelect } from "../components/PlacementSelect";
import { Toggle, ToggleRow } from "../components/Toggle";

export function ModulePage({ values }: { values: Record<string, unknown> }) {
  const { id } = useParams();
  const module = modules.find((m) => m.id === id);
  if (!module) return <Navigate to="/modules" replace />;
  // Keyed so each module's `useHiddenSettings` hook gets its own component.
  return <ModuleSettings key={module.id} module={module} values={values} />;
}

const noHidden = () => [] as string[];

function ModuleSettings({ module, values }: { module: IslandModule; values: Record<string, unknown> }) {
  const t = useT();
  const hidden = (module.useHiddenSettings ?? noHidden)();
  const settings = module.settings?.filter((def) => !hidden.includes(def.key)) ?? [];

  const enabledDef = moduleEnabled(module.id, module.title);
  const enabled = readSetting(values, enabledDef);
  const Section = module.SettingsSection;

  return (
    <>
      <Link to="/modules" className="settings-back">
        ‹ {t("modules.title")}
      </Link>
      <h1 className="settings-title settings-title-icon">
        <span className="settings-title-glyph">{module.settingsIcon}</span>
        {t(module.title)}
      </h1>
      <section className="settings-card">
        <label className="settings-row">
          <div className="settings-text">
            <span className="settings-label">{t("settings.module.label")}</span>
            <span className="settings-desc">{t("settings.module.desc")}</span>
          </div>
          <Toggle checked={enabled} onChange={(v) => setSetting(enabledDef, v)} />
        </label>
        <div className={`settings-row is-static ${enabled ? "" : "is-disabled"}`}>
          <div className="settings-text">
            <span className="settings-label">{t("layout.place")}</span>
            <span className="settings-desc">{t("layout.placeDesc")}</span>
          </div>
          <PlacementSelect moduleId={module.id} disabled={!enabled} />
        </div>
      </section>
      <motion.div
        className="settings-group"
        initial={false}
        animate={{ opacity: enabled ? 1 : 0.4 }}
        style={{ pointerEvents: enabled ? "auto" : "none" }}
      >
        {!!settings.length && (
          <section className="settings-card">
            {settings.map((def) => (
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

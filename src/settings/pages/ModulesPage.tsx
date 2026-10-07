import { Reorder, useDragControls } from "motion/react";
import { useNavigate } from "react-router";
import { GripIcon } from "../../components/icons";
import { useT } from "../../core/i18n";
import { inOrder, layoutSettings, moduleEnabled, readSetting, setSetting } from "../../core/settings";
import type { IslandModule } from "../../core/types";
import { modules } from "../../modules";
import { Toggle } from "../components/Toggle";

/**
 * Every module of the island in one list: drag to reorder the tabs, choose
 * which ones sit in the tab bar (the rest stay one click away in the
 * launcher), turn them on or off, and click one to open its own settings.
 * (Pointer-driven reorder: HTML drag & drop doesn't reach the webview while
 * Tauri handles file drops.)
 */
export function ModulesPage({ values }: { values: Record<string, unknown> }) {
  const t = useT();
  const ordered = inOrder(modules, (m) => m.id, readSetting(values, layoutSettings.order));
  const pinned = readSetting(values, layoutSettings.pinned);

  const togglePin = (id: string) =>
    setSetting(layoutSettings.pinned, pinned.includes(id) ? pinned.filter((p) => p !== id) : [...pinned, id]);

  return (
    <>
      <h1 className="settings-title">{t("modules.title")}</h1>
      <p className="settings-lead">{t("modules.desc")}</p>
      <section className="settings-card">
        <Reorder.Group
          as="ul"
          axis="y"
          className="layout-list"
          values={ordered.map((m) => m.id)}
          onReorder={(ids: string[]) => setSetting(layoutSettings.order, ids)}
        >
          {ordered.map((m) => (
            <ModuleRow
              key={m.id}
              module={m}
              enabled={readSetting(values, moduleEnabled(m.id, m.title))}
              pinned={pinned.includes(m.id)}
              onPin={() => togglePin(m.id)}
            />
          ))}
        </Reorder.Group>
      </section>
    </>
  );
}

function ModuleRow({
  module,
  enabled,
  pinned,
  onPin,
}: {
  module: IslandModule;
  enabled: boolean;
  pinned: boolean;
  onPin: () => void;
}) {
  const t = useT();
  const drag = useDragControls();
  const navigate = useNavigate();
  const open = () => navigate(`/modules/${module.id}`);
  return (
    <Reorder.Item
      as="li"
      value={module.id}
      className={`layout-row ${enabled ? "" : "is-off"}`}
      dragListener={false}
      dragControls={drag}
      whileDrag={{ scale: 1.02, boxShadow: "0 10px 24px -10px rgba(0,0,0,0.6)" }}
    >
      <span className="layout-grip" title={t("layout.drag")} onPointerDown={(e) => drag.start(e)}>
        <GripIcon size={14} />
      </span>
      <button type="button" className="layout-open" title={t("modules.open")} onClick={open}>
        <span className="layout-icon">{module.settingsIcon}</span>
        <span className="layout-name">{t(module.title)}</span>
      </button>
      <button
        type="button"
        className={`layout-pin ${pinned ? "is-on" : ""}`}
        disabled={!enabled}
        title={t(pinned ? "layout.unpin" : "layout.pin")}
        onClick={onPin}
      >
        {t(pinned ? "layout.inBar" : "layout.inLauncher")}
      </button>
      <Toggle checked={enabled} onChange={(v) => setSetting(moduleEnabled(module.id, module.title), v)} />
      <button type="button" className="layout-chevron" title={t("modules.open")} onClick={open}>
        ›
      </button>
    </Reorder.Item>
  );
}

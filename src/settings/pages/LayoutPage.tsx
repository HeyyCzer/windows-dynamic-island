import { Reorder, useDragControls } from "motion/react";
import { GripIcon } from "../../components/icons";
import { useT } from "../../core/i18n";
import { inOrder, layoutSettings, moduleEnabled, readSetting, setSetting } from "../../core/settings";
import type { IslandModule } from "../../core/types";
import { modules } from "../../modules";
import { Toggle } from "../components/Toggle";

/**
 * Tabs of the island: drag to reorder, pin the ones that sit in the tab bar
 * (the rest stay one click away in the launcher), turn modules off.
 * (Pointer-driven reorder: HTML drag & drop doesn't reach the webview while
 * Tauri handles file drops.)
 */
export function LayoutPage({ values }: { values: Record<string, unknown> }) {
  const t = useT();
  const ordered = inOrder(modules, (m) => m.id, readSetting(values, layoutSettings.order));
  const pinned = readSetting(values, layoutSettings.pinned);

  const togglePin = (id: string) =>
    setSetting(layoutSettings.pinned, pinned.includes(id) ? pinned.filter((p) => p !== id) : [...pinned, id]);

  return (
    <>
      <h1 className="settings-title">{t("layout.title")}</h1>
      <p className="settings-lead">{t("layout.desc")}</p>
      <section className="settings-card">
        <Reorder.Group
          as="ul"
          axis="y"
          className="layout-list"
          values={ordered.map((m) => m.id)}
          onReorder={(ids: string[]) => setSetting(layoutSettings.order, ids)}
        >
          {ordered.map((m) => (
            <LayoutRow
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

function LayoutRow({
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
      <span className="layout-icon">{module.settingsIcon}</span>
      <span className="layout-name">{t(module.title)}</span>
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
    </Reorder.Item>
  );
}

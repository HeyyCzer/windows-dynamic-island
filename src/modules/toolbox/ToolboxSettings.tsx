import { Reorder, useDragControls } from "motion/react";
import { Glyph } from "../../components/Glyph";
import { GripIcon } from "../../components/icons";
import { useT } from "../../core/i18n";
import { inOrder, readSetting, setSetting, useSettings } from "../../core/settings";
import { Toggle } from "../../settings/components/Toggle";
import { TOOLBOX_TOOLS, toolboxSettings, toolboxToolSettings, toolboxToolTitleKeys, type ToolboxToolId } from "./settings";

const ICONS: Record<ToolboxToolId, string> = { calculator: "code", timer: "timer", stopwatch: "clock", focus: "heart" };

/** Per-tool availability and order, persisted alongside the normal module settings. */
export function ToolboxSettings() {
  const t = useT();
  const values = useSettings();
  const ordered = inOrder([...TOOLBOX_TOOLS], (id) => id, readSetting(values, toolboxSettings.toolOrder));
  return (
    <div className="toolbox-settings">
      <span className="settings-desc">{t("toolbox.settings.desc")}</span>
      <Reorder.Group as="ul" axis="y" className="toolbox-settings-list" values={ordered} onReorder={(ids: ToolboxToolId[]) => setSetting(toolboxSettings.toolOrder, ids)}>
        {ordered.map((id) => <ToolRow key={id} id={id} enabled={readSetting(values, toolboxToolSettings[id])} />)}
      </Reorder.Group>
    </div>
  );
}

function ToolRow({ id, enabled }: { id: ToolboxToolId; enabled: boolean }) {
  const t = useT();
  const drag = useDragControls();
  return (
    <Reorder.Item as="li" value={id} className={`toolbox-settings-row ${enabled ? "" : "is-off"}`} dragListener={false} dragControls={drag}>
      <span className="toolbox-settings-grip" title={t("layout.drag")} onPointerDown={(e) => drag.start(e)}><GripIcon size={13} /></span>
      <Glyph name={ICONS[id]} size={14} />
      <span className="toolbox-settings-name">{t(toolboxToolTitleKeys[id])}</span>
      <Toggle checked={enabled} onChange={(value) => setSetting(toolboxToolSettings[id], value)} />
    </Reorder.Item>
  );
}

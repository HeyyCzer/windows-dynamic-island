import { Reorder, useDragControls } from "motion/react";
import { useEffect, useState } from "react";
import { Glyph } from "../../components/Glyph";
import { GripIcon } from "../../components/icons";
import { useT } from "../../core/i18n";
import { inOrder, readSetting, setSetting, useSetting, useSettings } from "../../core/settings";
import { ShortcutRow } from "../../settings/components/ShortcutRow";
import { Toggle } from "../../settings/components/Toggle";
import { TOOLBOX_TOOLS, toolboxSettings, toolboxToolSettings, toolboxToolTitleKeys, type ToolboxToolId } from "./settings";

const ICONS: Record<ToolboxToolId, string> = { calculator: "code", timer: "timer", stopwatch: "clock", focus: "heart", notes: "text" };

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
      <ToolboxPreferences />
      <CalculatorShortcut values={values} />
    </div>
  );
}

/** The shortcut belongs to the calculator, rather than to the ToolBox shell. */
function CalculatorShortcut({ values }: { values: Record<string, unknown> }) {
  const t = useT();
  return <div className="toolbox-preferences">
    <strong className="toolbox-settings-heading">{t("toolbox.calculator.title")}</strong>
    <ShortcutRow id="toolboxCalculator" values={values} />
  </div>;
}

function ToolboxPreferences() {
  const t = useT();
  const timer = useSetting(toolboxSettings.timerMinutes);
  const focus = useSetting(toolboxSettings.focusMinutes);
  const pause = useSetting(toolboxSettings.focusBreakMinutes);
  const sessions = useSetting(toolboxSettings.focusSessions);
  const autoNext = useSetting(toolboxSettings.focusAutoNext);
  const autoBreak = useSetting(toolboxSettings.focusAutoBreak);
  const lineNumbers = useSetting(toolboxSettings.notesLineNumbers);
  return <div className="toolbox-preferences">
    <strong className="toolbox-settings-heading">{t("toolbox.timer.title")}</strong>
    <NumberRow label={t("toolbox.timer.default")} value={timer} onChange={(v) => setSetting(toolboxSettings.timerMinutes, v)} />
    <strong className="toolbox-settings-heading">{t("toolbox.focus.title")}</strong>
    <NumberRow label={t("toolbox.focus.duration")} value={focus} onChange={(v) => setSetting(toolboxSettings.focusMinutes, v)} />
    <NumberRow label={t("toolbox.focus.break")} value={pause} onChange={(v) => setSetting(toolboxSettings.focusBreakMinutes, v)} />
    <NumberRow label={t("toolbox.focus.sessions")} value={sessions} max={12} unit="" onChange={(v) => setSetting(toolboxSettings.focusSessions, v)} />
    <label className="toolbox-settings-row"><span className="toolbox-settings-name">{t("toolbox.focus.autoNext")}</span><Toggle checked={autoNext} onChange={(v) => setSetting(toolboxSettings.focusAutoNext, v)} /></label>
    <label className="toolbox-settings-row"><span className="toolbox-settings-name">{t("toolbox.focus.autoBreak")}</span><Toggle checked={autoBreak} onChange={(v) => setSetting(toolboxSettings.focusAutoBreak, v)} /></label>
    <strong className="toolbox-settings-heading">{t("toolbox.notes.title")}</strong>
    <label className="toolbox-settings-row"><span className="toolbox-settings-name">{t("toolbox.notes.lineNumbers")}</span><Toggle checked={lineNumbers} onChange={(v) => setSetting(toolboxSettings.notesLineNumbers, v)} /></label>
  </div>;
}

function NumberRow({ label, value, max = 180, unit = "min", onChange }: { label: string; value: number; max?: number; unit?: string; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => { const next = Math.round(Number(draft)); onChange(Number.isFinite(next) ? Math.max(1, Math.min(max, next)) : 1); };
  return <label className="toolbox-settings-row"><span className="toolbox-settings-name">{label}</span><span className="settings-number"><input type="number" min={1} max={max} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />{unit && <span className="settings-unit">{unit}</span>}</span></label>;
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

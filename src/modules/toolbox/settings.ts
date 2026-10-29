import type { SettingDef } from "../../core/settings";
import type { MessageKey } from "../../core/i18n";

export const TOOLBOX_TOOLS = ["notes", "calculator", "timer", "stopwatch", "focus"] as const;
export type ToolboxToolId = (typeof TOOLBOX_TOOLS)[number];

export const toolboxToolTitleKeys = {
  calculator: "toolbox.calculator.title",
  timer: "toolbox.timer.title",
  stopwatch: "toolbox.stopwatch.title",
  focus: "toolbox.focus.title",
  notes: "toolbox.notes.title",
} as const satisfies Record<ToolboxToolId, MessageKey>;

export const toolboxToolSettings: Record<ToolboxToolId, SettingDef<boolean>> = {
  calculator: { key: "toolbox.calculator.enabled", label: toolboxToolTitleKeys.calculator, default: true },
  timer: { key: "toolbox.timer.enabled", label: toolboxToolTitleKeys.timer, default: true },
  stopwatch: { key: "toolbox.stopwatch.enabled", label: toolboxToolTitleKeys.stopwatch, default: true },
  focus: { key: "toolbox.focus.enabled", label: toolboxToolTitleKeys.focus, default: true },
  notes: { key: "toolbox.notes.enabled", label: toolboxToolTitleKeys.notes, default: true },
};

export const toolboxSettings = {
  notesText: { key: "toolbox.notesText", label: "toolbox.notes.title", default: "" } satisfies SettingDef<string>,
  notesLineNumbers: { key: "toolbox.notesLineNumbers", label: "toolbox.notes.lineNumbers", default: false } satisfies SettingDef<boolean>,
  timerMinutes: { key: "toolbox.timerMinutes", label: "toolbox.timer.default", default: 5 } satisfies SettingDef<number>,
  focusMinutes: { key: "toolbox.focusMinutes", label: "toolbox.focus.duration", default: 25 } satisfies SettingDef<number>,
  focusBreakMinutes: { key: "toolbox.focusBreakMinutes", label: "toolbox.focus.break", default: 5 } satisfies SettingDef<number>,
  focusSessions: { key: "toolbox.focusSessions", label: "toolbox.focus.sessions", default: 4 } satisfies SettingDef<number>,
  focusAutoNext: { key: "toolbox.focusAutoNext", label: "toolbox.focus.autoNext", default: false } satisfies SettingDef<boolean>,
  focusAutoBreak: { key: "toolbox.focusAutoBreak", label: "toolbox.focus.autoBreak", default: false } satisfies SettingDef<boolean>,
  lastTool: {
    key: "toolbox.lastTool",
    label: "toolbox.title",
    default: "calculator" as ToolboxToolId,
  } satisfies SettingDef<ToolboxToolId>,
  toolOrder: {
    key: "toolbox.order",
    label: "toolbox.order.label",
    description: "toolbox.order.desc",
    default: [...TOOLBOX_TOOLS] as ToolboxToolId[],
  } satisfies SettingDef<ToolboxToolId[]>,
};

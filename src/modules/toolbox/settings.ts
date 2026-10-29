import type { SettingDef } from "../../core/settings";
import type { MessageKey } from "../../core/i18n";

export const TOOLBOX_TOOLS = ["calculator", "timer", "stopwatch", "focus"] as const;
export type ToolboxToolId = (typeof TOOLBOX_TOOLS)[number];

export const toolboxToolTitleKeys = {
  calculator: "toolbox.calculator.title",
  timer: "toolbox.timer.title",
  stopwatch: "toolbox.stopwatch.title",
  focus: "toolbox.focus.title",
} as const satisfies Record<ToolboxToolId, MessageKey>;

export const toolboxToolSettings: Record<ToolboxToolId, SettingDef<boolean>> = {
  calculator: { key: "toolbox.calculator.enabled", label: toolboxToolTitleKeys.calculator, default: true },
  timer: { key: "toolbox.timer.enabled", label: toolboxToolTitleKeys.timer, default: true },
  stopwatch: { key: "toolbox.stopwatch.enabled", label: toolboxToolTitleKeys.stopwatch, default: true },
  focus: { key: "toolbox.focus.enabled", label: toolboxToolTitleKeys.focus, default: true },
};

export const toolboxSettings = {
  toolOrder: {
    key: "toolbox.order",
    label: "toolbox.order.label",
    description: "toolbox.order.desc",
    default: [...TOOLBOX_TOOLS] as ToolboxToolId[],
  } satisfies SettingDef<ToolboxToolId[]>,
};

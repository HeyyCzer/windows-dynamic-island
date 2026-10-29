import { Glyph } from "../../components/Glyph";
import type { IslandModule, ModuleView } from "../../core/types";
import { ToolboxPanel } from "./ToolboxPanel";
import { ToolboxSettings } from "./ToolboxSettings";
import "./toolbox.css";

/** Quick, local utilities that are useful without leaving the island. */
export const toolboxModule: IslandModule = {
  id: "toolbox",
  title: "toolbox.title",
  settingsIcon: <Glyph name="code" size={14} />,
  SettingsSection: ToolboxSettings,
  useView(): ModuleView {
    return { active: false, priority: 0, accent: "#64d2ff", icon: <Glyph name="code" size={14} color="#64d2ff" />, expanded: <ToolboxPanel />, expandedSize: { width: 560, height: 248 } };
  },
};

/**
 * System monitor — CPU, memory, GPU and network with their last minute, an
 * optional side bubble, and alerts when the CPU or the memory stays maxed out.
 * Backend: `src-tauri/src/providers/monitor/`.
 */
import { Glyph } from "../../components/Glyph";
import { useProvider } from "../../core/bridge";
import { useSetting } from "../../core/settings";
import type { IslandModule, ModuleView } from "../../core/types";
import { MonitorBubble } from "./components/MonitorBubble";
import { MonitorPanel } from "./components/MonitorPanel";
import { systemMonitorSettings } from "./settings";
import { MONITOR_GREEN, MONITOR_PROVIDER, type MonitorState } from "./types";
import "./monitor.css";

export const monitorModule: IslandModule = {
  id: "monitor",
  title: "monitor.title",
  settingsIcon: <Glyph name="pulse" size={14} />,
  settings: Object.values(systemMonitorSettings),
  useView(): ModuleView {
    const state = useProvider<MonitorState>(MONITOR_PROVIDER);
    const showBubble = useSetting(systemMonitorSettings.showBubble);

    return {
      active: false,
      priority: 0,
      accent: MONITOR_GREEN,
      icon: <Glyph name="pulse" size={14} color={MONITOR_GREEN} />,
      ambient: showBubble && state?.cpu != null ? <MonitorBubble state={state} /> : undefined,
      expanded: <MonitorPanel state={state} />,
      expandedSize: { width: 560, height: 132 },
    };
  },
};

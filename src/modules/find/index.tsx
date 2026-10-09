/**
 * Find on screen — what you type is looked for in everything on the screen,
 * text inside pictures included (Windows' OCR). Every match is highlighted
 * like a browser's find in page, and Enter takes the mouse to the next one.
 * Ctrl+Alt+F opens it from anywhere.
 * Backend: `src-tauri/src/providers/find/`.
 */
import { Glyph } from "../../components/Glyph";
import { useProvider } from "../../core/bridge";
import type { IslandModule, ModuleView } from "../../core/types";
import { FindPanel } from "./components/FindPanel";
import { findSettings } from "./settings";
import { FIND_PROVIDER, FIND_YELLOW, type FindState } from "./store";
import "./find.css";

export const findModule: IslandModule = {
  id: "find",
  title: "find.title",
  settingsIcon: <Glyph name="search" size={14} />,
  settings: Object.values(findSettings),
  useView(): ModuleView {
    const state = useProvider<FindState>(FIND_PROVIDER);
    return {
      active: false,
      priority: 0,
      accent: FIND_YELLOW,
      icon: <Glyph name="search" size={14} color={FIND_YELLOW} />,
      expanded: <FindPanel state={state} />,
      expandedSize: { width: 540, height: 108 },
    };
  },
};

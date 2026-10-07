/**
 * Shelf — like the notch apps on the Mac: drag files or folders onto the
 * island and it keeps them for a moment (by reference, nothing is copied).
 * Drag them out to any app, double-click to open, or ask Claude about them.
 * Backend: `src-tauri/src/providers/shelf.rs`.
 */
import { Glyph } from "../../components/Glyph";
import { useProvider } from "../../core/bridge";
import { draggingFiles } from "../../core/island";
import type { IslandModule, ModuleView } from "../../core/types";
import { SHELF_PROVIDER, type ShelfState } from "./actions";
import { ShelfPanel } from "./components/ShelfPanel";
import "./shelf.css";

const SHELF_BLUE = "#64D2FF";
const PER_ROW = 5;
const ROW = 100;

export const shelfModule: IslandModule = {
  id: "shelf",
  title: "shelf.title",
  settingsIcon: <Glyph name="folder" size={14} />,
  useView(): ModuleView {
    const state = useProvider<ShelfState>(SHELF_PROVIDER);
    const dragging = draggingFiles.use();
    const count = state?.items.length ?? 0;
    const rows = Math.min(2, Math.max(1, Math.ceil(count / PER_ROW)));

    return {
      active: false,
      priority: 0,
      // Shows up once it holds something, or while files are dragged over the island.
      hidden: count === 0 && !dragging,
      accent: SHELF_BLUE,
      icon: <Glyph name="folder" size={14} color={SHELF_BLUE} />,
      expanded: <ShelfPanel state={state} />,
      expandedSize: { width: 560, height: 54 + rows * ROW },
    };
  },
};

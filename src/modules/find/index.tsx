import { SearchIcon } from "lucide-react";
/**
 * Find on screen — what you type is looked for in everything on the screen,
 * text inside pictures included (Windows' OCR). Every match is highlighted
 * like a browser's find in page, and Enter takes the mouse to the next one.
 * A global shortcut (Ctrl+Alt+F by default) opens it from anywhere.
 * Backend: `src-tauri/src/providers/find/`.
 */
import { useProvider } from "../../core/bridge";
import type { IslandModule, ModuleView } from "../../core/types";
import { FindPanel } from "./components/FindPanel";
import { findSettings } from "./settings";
import { FIND_PROVIDER, FIND_YELLOW, type FindState } from "./store";

export const findModule: IslandModule = {
	id: "find",
	shortcut: "find",
	title: "find.title",
	settingsIcon: <SearchIcon size={14} />,
	settings: Object.values(findSettings),
	useView(): ModuleView {
		const state = useProvider<FindState>(FIND_PROVIDER);
		return {
			active: false,
			priority: 0,
			accent: FIND_YELLOW,
			icon: <SearchIcon size={14} color={FIND_YELLOW} />,
			expanded: <FindPanel state={state} />,
			expandedSize: { width: 540, height: 108 },
		};
	},
};

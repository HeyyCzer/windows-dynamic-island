import { useRef } from "react";
import { draggingFiles } from "../../core/island";
import { useFileDrop } from "../../core/useFileDrop";
import type { IslandController } from "../../core/useIslandController";
import { attachFiles } from "../../modules/ask/store";
import { addToShelf } from "../../modules/shelf/actions";

/**
 * Files dragged over the island: the shelf opens to take them, unless "Ask
 * Claude" is open (then they become attachments). The backend lets files in a
 * little around the island too, so it stays open meanwhile.
 */
export function useIslandFileDrop(ctl: IslandController) {
	const live = useRef(ctl);
	live.current = ctl;
	const asking = () => live.current.mode === "expanded" && live.current.tab === "ask";

	useFileDrop({
		onEnter: () => {
			draggingFiles.set(true);
			ctl.keepOpen(true, "files");
			if (asking()) ctl.expand();
			else ctl.expand("shelf");
		},
		onLeave: () => {
			draggingFiles.set(false);
			ctl.keepOpen(false, "files");
		},
		onDrop: (paths) => {
			draggingFiles.set(false);
			const toAsk = asking();
			ctl.keepOpen(false, "files");
			if (toAsk) {
				attachFiles(paths);
			} else {
				addToShelf(paths);
				// Pointer still over the island: it stays open; otherwise a peek.
				ctl.peek("shelf");
			}
		},
	});
}

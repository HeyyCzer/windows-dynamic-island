import { useTauriEvent } from "./bridge";

interface Handlers {
  onEnter: () => void;
  onLeave: () => void;
  onDrop: (paths: string[]) => void;
}

/** Mirrors `DropEvent` in `src-tauri/src/file_drop.rs`. */
type DropEvent = { type: "enter" } | { type: "leave" } | { type: "drop"; paths: string[] };

/**
 * Files dragged from Explorer (or any app) onto the island window. The
 * backend has its own drop target (wry's misses the island, see
 * `file_drop.rs`); text, links and the like never get here.
 */
export function useFileDrop(handlers: Handlers) {
  useTauriEvent<DropEvent>("island://file-drop", (e) => {
    if (e.type === "enter") handlers.onEnter();
    else if (e.type === "leave") handlers.onLeave();
    else handlers.onDrop(e.paths);
  });
}

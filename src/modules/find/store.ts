import { createStore } from "../../core/island";

/** Mirrors `FindState` in `src-tauri/src/providers/find/mod.rs`. */
export interface FindState {
  /** Reading the screen right now. */
  scanning: boolean;
  /** The screen was read, so the count means something. */
  scanned: boolean;
  count: number;
  /** The current match (0-based). */
  current: number | null;
  /** `noOcr`: Windows has no OCR for the profile's languages; `failed`: nothing could be read. */
  error: "noOcr" | "failed" | null;
  /** Global shortcut that opens the page ("Ctrl+Alt+F"). */
  hotkey: string | null;
}

export const FIND_PROVIDER = "find";
export const FIND_YELLOW = "#FFD60A";

/** The global shortcut opened the page: its field takes the keyboard. */
export const focusRequest = createStore(false);

export function requestFindFocus() {
  focusRequest.set(true);
}

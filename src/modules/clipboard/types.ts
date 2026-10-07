import { providerAction } from "../../core/bridge";

/** Mirrors `ItemView` in `src-tauri/src/providers/clipboard/mod.rs`. */
export interface ClipItem {
  id: number;
  kind: "text" | "image" | "files";
  /** Text: its start, on one line. */
  preview: string | null;
  chars: number | null;
  /** Pictures: small PNG data URL, full size and the saved file. */
  thumb: string | null;
  width: number | null;
  height: number | null;
  path: string | null;
  /** Files: their names. */
  names: string[];
  screenshot: boolean;
  /** App that copied it. */
  source: string | null;
  copiedAt: number;
  /** Copied again from the island: no "copied" pill. */
  quiet: boolean;
}

export interface ClipboardState {
  items: ClipItem[];
}

export const CLIPBOARD_PROVIDER = "clipboard";
export const CLIPBOARD_YELLOW = "#FFD60A";

export const clipAction = <T = unknown>(
  action: "copy" | "remove" | "drag" | "open" | "keep" | "text",
  id: number,
) => providerAction<T>(CLIPBOARD_PROVIDER, action, id);

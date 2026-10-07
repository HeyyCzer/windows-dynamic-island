import { providerAction } from "../../core/bridge";
import { createStore } from "../../core/island";

/** Mirrors `Attachment` in `src-tauri/src/providers/ask/mod.rs`. */
export interface Attachment {
  path: string;
  name: string;
  isImage: boolean;
  label: string | null;
  thumb: string | null;
}

export interface AskMessage {
  fromUser: boolean;
  text: string;
  error: boolean;
  attachments: Attachment[];
}

export interface AskState {
  available: boolean;
  messages: AskMessage[];
  running: boolean;
  status: { kind: "thinking" | "writing" | "tool"; arg: string | null } | null;
  unread: boolean;
  hotkey: string | null;
}

export const ASK_PROVIDER = "ask";
export const CLAUDE_ORANGE = "#D97757";

/** Goes with the next question (screenshots, dropped files, shelf items). */
export const pendingAttachments = createStore<Attachment[]>([]);

/** The input should take the keyboard (global shortcut, "ask about this file"); the panel consumes it. */
export const focusRequest = createStore(false);

/** Text to put in the question box (e.g. copied text); the panel consumes it. */
export const draftRequest = createStore<string | null>(null);

export function addAttachments(list: Attachment[]) {
  pendingAttachments.set((prev) => [
    ...prev,
    ...list.filter((a) => !prev.some((p) => p.path.toLowerCase() === a.path.toLowerCase())),
  ]);
}

export async function attachFiles(paths: string[]) {
  const list = await providerAction<Attachment[]>(ASK_PROVIDER, "attachments", paths);
  if (list?.length) addAttachments(list);
}

export function requestAskFocus() {
  focusRequest.set(true);
}

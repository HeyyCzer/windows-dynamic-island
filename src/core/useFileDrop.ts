import { useEffect, useRef } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { isTauri } from "./bridge";

interface Handlers {
  onEnter: () => void;
  onLeave: () => void;
  onDrop: (paths: string[]) => void;
}

/** Files dragged from Explorer (or any app) onto the island window. */
export function useFileDrop(handlers: Handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    getCurrentWebview()
      .onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === "enter") ref.current.onEnter();
        else if (p.type === "leave") ref.current.onLeave();
        else if (p.type === "drop") ref.current.onDrop(p.paths);
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}

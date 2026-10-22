import { useCallback, useEffect, useRef, useState } from "react";

const HOVER_IN_DELAY = 110;
const HOVER_OUT_DELAY = 380;
/**
 * Switching tabs can shrink the island out from under the pointer: for this
 * long after a resize, leaving waits {@link RESIZE_OUT_DELAY} instead.
 */
const RESIZE_GRACE_MS = 2000;
const RESIZE_OUT_DELAY = 1200;

interface Options {
  /** Entering expands the island; when off, only a click does. */
  expandOnHover: boolean;
  onOpen: () => void;
  onClose: () => void;
}

/**
 * Whether the island is expanded, as driven by the pointer (the Rust hit-test
 * thread inside Tauri, DOM events in the browser), clicks and shortcuts.
 *
 * Leaving always collapses, after a short delay. Dragging the island
 * (`lockHover`) and holds (`keepOpen`: typing a question, dragging files in)
 * keep it open wherever the pointer goes; the pointer's last state applies
 * once every reason to stay open has ended.
 */
export function useIslandHover({ expandOnHover, onOpen, onClose }: Options) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef({ expandOnHover, onOpen, onClose });
  latest.current = { expandOnHover, onOpen, onClose };

  const pointerInside = useRef(false);
  const locked = useRef(false);
  const holds = useRef(new Set<string>());
  const resizedAt = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const transition = useCallback((inside: boolean, immediate = false) => {
    window.clearTimeout(timer.current);
    // Back in before the island closed (or out before it opened): nothing to do.
    if (inside === openRef.current) return;
    const apply = () => {
      openRef.current = inside;
      setOpen(inside);
      if (inside) latest.current.onOpen();
      else latest.current.onClose();
    };
    if (immediate) return apply();
    const justResized = Date.now() - resizedAt.current < RESIZE_GRACE_MS;
    const delay = inside ? HOVER_IN_DELAY : justResized ? RESIZE_OUT_DELAY : HOVER_OUT_DELAY;
    timer.current = window.setTimeout(apply, delay);
  }, []);

  const onPointer = useCallback(
    (inside: boolean) => {
      pointerInside.current = inside;
      if (locked.current || holds.current.size > 0) return;
      if (!inside || latest.current.expandOnHover) transition(inside);
      else window.clearTimeout(timer.current);
    },
    [transition],
  );

  const lockHover = useCallback((on: boolean) => {
    locked.current = on;
    if (on) window.clearTimeout(timer.current);
  }, []);

  const keepOpen = useCallback(
    (on: boolean, reason = "default") => {
      if (on) holds.current.add(reason);
      else holds.current.delete(reason);
      if (holds.current.size > 0) window.clearTimeout(timer.current);
      else if (!pointerInside.current) transition(false);
    },
    [transition],
  );

  /** The island is about to change size: give the pointer time to follow. */
  const expectResize = useCallback(() => {
    resizedAt.current = Date.now();
  }, []);

  const expand = useCallback(() => transition(true, true), [transition]);
  const collapse = useCallback(() => {
    holds.current.clear();
    transition(false, true);
  }, [transition]);

  return { open, expand, collapse, onPointer, keepOpen, lockHover, expectResize };
}

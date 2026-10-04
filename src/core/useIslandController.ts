import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { command, isTauri, useTauriEvent } from "./bridge";
import { generalSettings, moduleEnabled, readSetting, useSettings } from "./settings";
import type { IslandMode, IslandModule, ModuleView } from "./types";

const HOVER_IN_DELAY = 110;
const HOVER_OUT_DELAY = 380;
const PEEK_DURATION = 3800;

export interface ModuleEntry {
  module: IslandModule;
  view: ModuleView;
}

/**
 * Decides what the island shows: which modules are active, which one owns the
 * main slot, and whether the island is idle, compact, peeking or expanded.
 */
export function useIslandController(modules: IslandModule[]) {
  const settings = useSettings();
  // The registry is static, so calling each module's hook in order is stable.
  // Disabled modules still run their hook (rules of hooks) but are dropped.
  const entries: ModuleEntry[] = modules
    .map((module) => ({ module, view: module.useView() }))
    .filter(({ module }) => readSetting(settings, moduleEnabled(module.id, module.title)));
  const hideInFullscreen = readSetting(settings, generalSettings.hideInFullscreen);
  const expandOnHover = readSetting(settings, generalSettings.expandOnHover);
  const expandOnHoverRef = useRef(expandOnHover);
  expandOnHoverRef.current = expandOnHover;

  const [hovered, setHovered] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [tab, setTab] = useState<string | null>(null);

  // --- hover (driven by the Rust hit-test thread inside Tauri) -------------
  const hoverTimer = useRef<number | undefined>(undefined);
  const setHover = useCallback((inside: boolean, immediate = false) => {
    window.clearTimeout(hoverTimer.current);
    const apply = () => {
      setHovered(inside);
      if (!inside) setTab(null);
    };
    if (immediate) apply();
    else hoverTimer.current = window.setTimeout(apply, inside ? HOVER_IN_DELAY : HOVER_OUT_DELAY);
  }, []);
  // Leaving always collapses; entering only expands when hover-to-expand is on.
  // Dragging the island keeps it as it is (the pointer may leave its shape).
  const hoverLocked = useRef(false);
  const lockHover = useCallback((locked: boolean) => {
    hoverLocked.current = locked;
    if (locked) window.clearTimeout(hoverTimer.current);
  }, []);
  const onPointer = useCallback(
    (inside: boolean) => {
      if (hoverLocked.current) return;
      if (!inside || expandOnHoverRef.current) setHover(inside);
      else window.clearTimeout(hoverTimer.current);
    },
    [setHover],
  );
  useTauriEvent<boolean>("island://hover", onPointer);

  // --- fullscreen apps hide the island --------------------------------------
  useTauriEvent<boolean>("island://fullscreen", setFullscreen);
  useEffect(() => {
    command<boolean>("is_fullscreen_active").then((v) => setFullscreen(!!v));
  }, []);

  // --- peek when a module reports new activity ------------------------------
  const lastKeys = useRef(new Map<string, string | undefined>());
  const peekTimer = useRef<number | undefined>(undefined);
  const keySignature = entries.map((e) => `${e.module.id}=${e.view.activityKey ?? ""}`).join("|");
  useEffect(() => {
    for (const { module, view } of entries) {
      const seen = lastKeys.current.has(module.id);
      const prev = lastKeys.current.get(module.id);
      lastKeys.current.set(module.id, view.activityKey);
      if (seen && view.activityKey && view.activityKey !== prev) {
        setPeekId(module.id);
        window.clearTimeout(peekTimer.current);
        peekTimer.current = window.setTimeout(() => setPeekId(null), PEEK_DURATION);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySignature]);

  const active = useMemo(
    () => entries.filter((e) => e.view.active).sort((a, b) => b.view.priority - a.view.priority),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries.map((e) => `${e.module.id}:${e.view.active}:${e.view.priority}`).join()],
  );
  const primary = active[0] ? entries.find((e) => e.module.id === active[0].module.id) : undefined;
  const secondary = active[1] ? entries.find((e) => e.module.id === active[1].module.id) : undefined;

  const mode: IslandMode = fullscreen && hideInFullscreen
    ? "hidden"
    : hovered
      ? "expanded"
      : peekId
        ? "peek"
        : primary
          ? "compact"
          : "idle";

  const focusedId =
    mode === "peek" ? peekId : (tab ?? primary?.module.id ?? entries[0]?.module.id ?? null);
  const focused = entries.find((e) => e.module.id === focusedId);

  const expand = useCallback(
    (moduleId?: string) => {
      if (moduleId) setTab(moduleId);
      setPeekId(null);
      setHover(true, true);
    },
    [setHover],
  );

  return {
    entries,
    mode,
    primary,
    secondary,
    focused,
    tab: focusedId,
    setTab,
    expand,
    lockHover,
    /** Browser-only hover handlers (Tauri uses the backend hit-test). */
    domHover: isTauri
      ? {}
      : { onMouseEnter: () => onPointer(true), onMouseLeave: () => onPointer(false) },
  };
}

import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import { command, isTauri, useTauriEvent } from "./bridge";
import { generalSettings, ISLAND_HIDDEN_KEY, moduleEnabled, readSetting, useSettings } from "./settings";
import type { IslandMode, IslandModule, ModuleView } from "./types";

const HOVER_IN_DELAY = 110;
const HOVER_OUT_DELAY = 380;
const PEEK_DURATION = 3800;
/** Mouse wheel switches tabs at most this often. */
const WHEEL_STEP_MS = 260;

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
  const swallowed = settings[ISLAND_HIDDEN_KEY] === true;
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
  // While typing a question the island stays open wherever the pointer goes;
  // the pointer's last state applies once that ends.
  const keptOpen = useRef(false);
  const pointerInside = useRef(false);
  const onPointer = useCallback(
    (inside: boolean) => {
      pointerInside.current = inside;
      if (hoverLocked.current || keptOpen.current) return;
      if (!inside || expandOnHoverRef.current) setHover(inside);
      else window.clearTimeout(hoverTimer.current);
    },
    [setHover],
  );
  useTauriEvent<boolean>("island://hover", onPointer);

  const keepOpen = useCallback(
    (on: boolean) => {
      keptOpen.current = on;
      if (on) window.clearTimeout(hoverTimer.current);
      else if (!pointerInside.current) setHover(false);
    },
    [setHover],
  );

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

  const mode: IslandMode = swallowed
    ? "swallowed"
    : fullscreen && hideInFullscreen
      ? "hidden"
      : hovered
        ? "expanded"
        : peekId
          ? "peek"
          : primary
            ? "compact"
            : "idle";

  const focusedId =
    mode === "peek" ? peekId : (tab ?? primary?.module.id ?? entries.find((e) => !e.view.hidden)?.module.id ?? null);
  const focused = entries.find((e) => e.module.id === focusedId);
  /** Tab bar: every module that isn't hidden, plus the focused one. */
  const tabs = entries.filter((e) => !e.view.hidden || e.module.id === focusedId);

  const expand = useCallback(
    (moduleId?: string) => {
      if (moduleId) setTab(moduleId);
      setPeekId(null);
      setHover(true, true);
    },
    [setHover],
  );
  /** Briefly show a module, as if it had new activity. */
  const peek = useCallback((moduleId: string) => {
    setPeekId(moduleId);
    window.clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => setPeekId(null), PEEK_DURATION);
  }, []);
  // The pinned video went back to the island: show the player for a moment.
  useTauriEvent("pip://return", () => peek("music"));

  const collapse = useCallback(() => {
    keptOpen.current = false;
    setPeekId(null);
    setHover(false, true);
  }, [setHover]);

  // Global shortcut (Ctrl+Alt+Space): open "Ask Claude".
  const askEnabled = entries.some((e) => e.module.id === "ask");
  useTauriEvent("island://ask", () => askEnabled && expand("ask"));

  // Mouse wheel over the open island flips through the tabs.
  const lastWheel = useRef(0);
  const tabIds = tabs.map((e) => e.module.id);
  const onWheel = useCallback(
    (e: WheelEvent) => {
      if (mode !== "expanded" || Math.abs(e.deltaY) < 4) return;
      // Scrollable content (chat, lists) keeps the wheel for itself.
      if ((e.target as Element).closest("[data-scroll]")) return;
      const now = performance.now();
      if (now - lastWheel.current < WHEEL_STEP_MS) return;
      lastWheel.current = now;
      const i = tabIds.indexOf(focusedId ?? "");
      const next = tabIds[Math.min(tabIds.length - 1, Math.max(0, i + Math.sign(e.deltaY)))];
      if (next && next !== focusedId) setTab(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, focusedId, tabIds.join()],
  );

  return {
    entries,
    tabs,
    mode,
    primary,
    secondary,
    focused,
    tab: focusedId,
    setTab,
    expand,
    peek,
    collapse,
    keepOpen,
    lockHover,
    onWheel,
    /** Browser-only hover handlers (Tauri uses the backend hit-test). */
    domHover: isTauri
      ? {}
      : { onMouseEnter: () => onPointer(true), onMouseLeave: () => onPointer(false) },
  };
}

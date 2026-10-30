import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import { command, isTauri, useTauriEvent } from "./bridge";
import {
  generalSettings,
  inOrder,
  ISLAND_HIDDEN_KEY,
  layoutSettings,
  moduleEnabled,
  readSetting,
  useSettings,
  type Values as Settings,
} from "./settings";
import type { IslandMode, IslandModule, ModuleEntry } from "./types";
import { useIslandHover } from "./useIslandHover";
import { usePeek } from "./usePeek";
import { useTabMemory } from "./useTabMemory";

export type { ModuleEntry } from "./types";

/** Mouse wheel switches tabs at most this often. */
const WHEEL_STEP_MS = 260;

/** Pseudo tab: the grid with every module. */
export const LAUNCHER = "launcher";

export type IslandController = ReturnType<typeof useIslandController>;

/**
 * Decides what the island shows: which modules are active, which one owns the
 * main slot, and whether the island is idle, compact, peeking or expanded.
 */
export function useIslandController(modules: IslandModule[]) {
  const settings = useSettings();
  const entries = useModuleEntries(modules, settings);
  const fullscreen = useFullscreen();

  // Required actions (such as a hydration reminder at zero) take precedence
  // over ordinary attention requests when deciding which tab opens.
  const forcedId = entries.find((e) => e.view.forceExpanded)?.module.id ?? null;
  const attentionId = forcedId ?? entries.find((e) => e.view.attention)?.module.id ?? null;
  const tabMemory = useTabMemory(attentionId);
  const { peekId, peek, endPeek } = usePeek(entries);
  const hover = useIslandHover({
    expandOnHover: readSetting(settings, generalSettings.expandOnHover),
    onOpen: tabMemory.onIslandOpen,
    onClose: tabMemory.onIslandClose,
  });

  const { primary, secondary } = useBusiest(entries);
  const forceExpanded = forcedId !== null;
  const mode = islandMode({
    swallowed: settings[ISLAND_HIDDEN_KEY] === true,
    hidden: fullscreen && readSetting(settings, generalSettings.hideInFullscreen),
    expanded: hover.open,
    forceExpanded,
    peeking: peekId !== null,
    busy: primary !== undefined,
  });

  // A remembered tab whose module was turned off meanwhile doesn't count.
  const { tab } = tabMemory;
  const openTab = tab === LAUNCHER || entries.some((e) => e.module.id === tab) ? tab : null;
  const focusedId =
    forcedId ?? (mode === "peek" ? peekId : (openTab ?? primary?.module.id ?? entries.find((e) => !e.view.hidden)?.module.id ?? null));
  const focused = entries.find((e) => e.module.id === focusedId);
  const tabs = tabBar(entries, settings, focusedId);

  /** A tab picked by the user: the island may shrink away from the pointer. */
  const selectTab = useCallback(
    (id: string | null) => {
      hover.expectResize();
      tabMemory.setTab(id);
    },
    [hover.expectResize, tabMemory.setTab],
  );

  const expand = useCallback(
    (moduleId?: string) => {
      if (moduleId) tabMemory.openOn(moduleId);
      endPeek();
      hover.expand();
    },
    [tabMemory.openOn, endPeek, hover.expand],
  );

  const collapse = useCallback(() => {
    endPeek();
    hover.collapse();
  }, [endPeek, hover.collapse]);

  // The pinned video went back to the island: show the player for a moment.
  useTauriEvent("pip://return", () => peek("music"));
  // Global shortcuts (`core/shortcuts.ts`) open "Ask Claude" and "Find on screen".
  const enabled = (id: string) => entries.some((e) => e.module.id === id);
  useTauriEvent("island://ask", () => enabled("ask") && expand("ask"));
  useTauriEvent("island://find", () => enabled("find") && expand("find"));
  useTauriEvent<boolean>("island://hover", hover.onPointer);

  const onWheel = useWheelTabs(
    mode === "expanded",
    tabs.map((e) => e.module.id),
    focusedId,
    selectTab,
  );

  return {
    entries,
    tabs,
    launcher: mode === "expanded" && focusedId === LAUNCHER,
    mode,
    primary,
    secondary,
    focused,
    tab: focusedId,
    setTab: selectTab,
    expand,
    peek,
    collapse,
    keepOpen: hover.keepOpen,
    lockHover: hover.lockHover,
    onWheel,
    /** Browser-only hover handlers (Tauri uses the backend hit-test). */
    domHover: isTauri
      ? {}
      : { onMouseEnter: () => hover.onPointer(true), onMouseLeave: () => hover.onPointer(false) },
  };
}

/**
 * Every enabled module with its current view, in the order chosen in the
 * settings. The registry is static, so calling each module's hook in order is
 * stable; disabled modules still run their hook (rules of hooks) but are dropped.
 */
function useModuleEntries(modules: IslandModule[], settings: Settings): ModuleEntry[] {
  return inOrder(
    modules
      // biome-ignore lint/correctness/useHookAtTopLevel: the module registry is static, so the hook order is stable
      .map((module) => ({ module, view: module.useView() }))
      .filter(({ module }) => readSetting(settings, moduleEnabled(module))),
    (e) => e.module.id,
    readSetting(settings, layoutSettings.order),
  );
}

/** The two active modules with the highest priority. */
function useBusiest(entries: ModuleEntry[]) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on a signature so a new entries array with the same views keeps the memo
  const active = useMemo(
    () => entries.filter((e) => e.view.active).sort((a, b) => b.view.priority - a.view.priority),
    [entries.map((e) => `${e.module.id}:${e.view.active}:${e.view.priority}`).join()],
  );
  // Looked up again so the views are this render's, not the memoized ones.
  const fresh = (e?: ModuleEntry) => (e ? entries.find((x) => x.module.id === e.module.id) : undefined);
  return { primary: fresh(active[0]), secondary: fresh(active[1]) };
}

/** Fullscreen apps hide the island. */
function useFullscreen() {
  const [fullscreen, setFullscreen] = useState(false);
  useTauriEvent<boolean>("island://fullscreen", setFullscreen);
  useEffect(() => {
    command<boolean>("is_fullscreen_active").then((v) => setFullscreen(!!v));
  }, []);
  return fullscreen;
}

function islandMode(s: {
  swallowed: boolean;
  hidden: boolean;
  expanded: boolean;
  forceExpanded: boolean;
  peeking: boolean;
  busy: boolean;
}): IslandMode {
  if (s.swallowed) return "swallowed";
  if (s.hidden) return "hidden";
  if (s.expanded || s.forceExpanded) return "expanded";
  if (s.peeking) return "peek";
  if (s.busy) return "compact";
  return "idle";
}

/**
 * Tab bar: the pinned modules that aren't hidden (empty), those pinned "even
 * when empty", any busy one, and the focused one. Everything enabled is in the
 * launcher.
 */
function tabBar(entries: ModuleEntry[], settings: Settings, focusedId: string | null) {
  const pinned = readSetting(settings, layoutSettings.pinned);
  const pinnedAlways = readSetting(settings, layoutSettings.pinnedAlways);
  return entries.filter(
    (e) =>
      pinnedAlways.includes(e.module.id) ||
      (!e.view.hidden && (pinned.includes(e.module.id) || e.view.active)) ||
      e.module.id === focusedId,
  );
}

/** Mouse wheel over the open island flips through the tabs. */
function useWheelTabs(
  enabled: boolean,
  tabIds: string[],
  current: string | null,
  select: (id: string) => void,
) {
  const lastWheel = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the joined ids so a new array with the same tabs keeps the callback
  return useCallback(
    (e: WheelEvent) => {
      if (!enabled || Math.abs(e.deltaY) < 4) return;
      // Scrollable content (chat, lists) keeps the wheel for itself.
      if ((e.target as Element).closest("[data-scroll]")) return;
      const now = performance.now();
      if (now - lastWheel.current < WHEEL_STEP_MS) return;
      lastWheel.current = now;
      const i = tabIds.indexOf(current ?? "");
      const next = tabIds[Math.min(tabIds.length - 1, Math.max(0, i + Math.sign(e.deltaY)))];
      if (next && next !== current) select(next);
    },
    [enabled, current, tabIds.join(), select],
  );
}

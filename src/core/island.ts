/**
 * What module panels can ask of the island they live in (open another tab,
 * stay open while typing…), plus small cross-module stores.
 */
import { createContext, useContext, useSyncExternalStore } from "react";
import type { IslandMode } from "./types";

export interface IslandApi {
  mode: IslandMode;
  /** Focused module id. */
  tab: string | null;
  /** Open the island on a module's tab (or the current one). */
  expand: (moduleId?: string) => void;
  /** Collapse now, even with the pointer inside. */
  collapse: () => void;
  /**
   * Stay open wherever the pointer goes (e.g. while typing a question). Each
   * `reason` is held separately; the island may close once all are released.
   */
  keepOpen: (on: boolean, reason?: string) => void;
}

export const IslandContext = createContext<IslandApi>({
  mode: "idle",
  tab: null,
  expand: () => {},
  collapse: () => {},
  keepOpen: () => {},
});

export const useIsland = () => useContext(IslandContext);

/** A tiny observable value for state shared between modules. */
export function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => void listeners.delete(l);
  };
  return {
    get: () => value,
    set(next: T | ((prev: T) => T)) {
      value = typeof next === "function" ? (next as (prev: T) => T)(value) : next;
      listeners.forEach((l) => l());
    },
    use: () => useSyncExternalStore(subscribe, () => value),
  };
}

/** Files are being dragged over the island (the shelf shows up to take them). */
export const draggingFiles = createStore(false);

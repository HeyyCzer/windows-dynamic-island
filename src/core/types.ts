import type { ComponentType, ReactNode } from "react";
import type { SettingDef } from "./settings";

/** What a module wants the island to render right now. */
export interface ModuleView {
  /** Wants a spot in the compact island (e.g. music playing, Claude working). */
  active: boolean;
  /** Higher wins the main compact slot; the runner-up becomes the side bubble. */
  priority: number;
  /** Small glyph used for the side bubble and the tab bar. */
  icon: ReactNode;
  /** Compact pill content. Required when `active`. */
  compact?: {
    left: ReactNode;
    right: ReactNode;
    /** Pill width in px (default 300). */
    width?: number;
  };
  /** Full panel shown on hover / peek. */
  expanded: ReactNode;
  /** Panel size in px (default 560×190). */
  expandedSize?: { width: number; height: number };
  /**
   * Changing this value makes the island briefly auto-expand ("peek") to show
   * this module, e.g. a new track started. `undefined` never peeks.
   */
  activityKey?: string;
}

export interface IslandModule {
  id: string;
  title: string;
  /**
   * React hook returning the module's current view. Called on every render of
   * the island, in registry order, so it must follow the rules of hooks.
   */
  useView: () => ModuleView;
  /** Toggles shown under this module in the settings window. */
  settings?: SettingDef[];
  /** Extra custom UI for the settings window (e.g. integration status). */
  SettingsSection?: ComponentType;
}

export type IslandMode = "hidden" | "idle" | "compact" | "peek" | "expanded";

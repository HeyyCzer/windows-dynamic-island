import type { ComponentType, ReactNode } from "react";
import type { MessageKey } from "./i18n";
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
  /**
   * Persistent bubble on the island's left while it is collapsed, shown even
   * when the module isn't `active` (e.g. a counter). Clicking it opens the
   * module's tab.
   */
  ambient?: ReactNode;
  /** Full panel shown on hover / peek. */
  expanded: ReactNode;
  /** Panel size in px (default 560×190). */
  expandedSize?: { width: number; height: number };
  /** Small controls in the tab bar, next to the gear, while this tab is open (e.g. volume). */
  tabBarExtra?: ReactNode;
  /**
   * Changing this value makes the island briefly auto-expand ("peek") to show
   * this module, e.g. a new track started. `undefined` never peeks.
   */
  activityKey?: string;
  /**
   * Left out of the tab bar (e.g. an empty shelf). It can still own the
   * compact island, peek, or be opened by `expand(id)`.
   */
  hidden?: boolean;
  /** Color of the module's tab ring in the Windows Island style. */
  accent?: string;
  /**
   * Waiting on the user (e.g. a permission to answer): opening the island
   * goes to this module's tab instead of the last one used.
   */
  attention?: boolean;
  /** Keeps the island open until this module's required action is resolved. */
  forceExpanded?: boolean;
}

export interface IslandModule {
  id: string;
  /** Translation key of the tab / settings card title. */
  title: MessageKey;
  /** Static glyph for the settings sidebar. */
  settingsIcon?: ReactNode;
  /** Whether the module starts on before the user toggles it. Defaults to true. */
  enabledByDefault?: boolean;
  /**
   * React hook returning the module's current view. Called on every render of
   * the island, in registry order, so it must follow the rules of hooks.
   */
  useView: () => ModuleView;
  /** Toggles shown under this module in the settings window. */
  settings?: SettingDef[];
  /**
   * Hook returning the keys of `settings` that don't apply to this machine
   * (e.g. battery alerts on a desktop); the settings window leaves them out.
   */
  useHiddenSettings?: () => string[];
  /** Extra custom UI for the settings window (e.g. integration status). */
  SettingsSection?: ComponentType;
}

/** An enabled module together with its current view. */
export interface ModuleEntry {
  module: IslandModule;
  view: ModuleView;
}

/** `hidden`: a fullscreen app is in front. `swallowed`: hidden in the tray's black hole. */
export type IslandMode = "hidden" | "swallowed" | "idle" | "compact" | "peek" | "expanded";

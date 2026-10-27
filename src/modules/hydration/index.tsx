/** Hydration timer, reminder panel and its optional persistent countdown bubble. */
import { useCallback, useEffect, useRef, useState } from "react";
import { WaterDropIcon } from "../../components/icons";
import { useT } from "../../core/i18n";
import { moduleEnabled, useSetting } from "../../core/settings";
import type { IslandModule, ModuleView } from "../../core/types";
import { HydrationBubble } from "./components/HydrationBubble";
import { HydrationPanel } from "./components/HydrationPanel";
import { HydrationSettings } from "./components/HydrationSettings";
import { hydrationInterval, hydrationSettings, hydrationSnooze } from "./settings";
import "./hydration.css";

const MINUTE = 60_000;

/**
 * Keeps just the deadline in state and uses one timeout to wake the island at
 * zero. The text components tick locally, avoiding an island-wide re-render
 * every second while the countdown is visible.
 */
function useHydrationTimer(intervalMinutes: number, snoozeMinutes: number, autoStart: boolean, enabled: boolean) {
  const intervalMs = intervalMinutes * MINUTE;
  const snoozeMs = snoozeMinutes * MINUTE;
  const [deadline, setDeadline] = useState<number | null>(() => (autoStart && enabled ? Date.now() + intervalMs : null));
  const [pausedRemaining, setPausedRemaining] = useState<number | null>(null);
  const [due, setDue] = useState(false);
  // Each pause/restart invalidates any timeout created for an older deadline.
  const generation = useRef(0);
  const config = `${intervalMinutes}:${autoStart}:${enabled}`;
  const previousConfig = useRef(config);

  // A configuration change intentionally starts a fresh interval, so a new
  // duration takes effect immediately and disabling the module stops its timer.
  useEffect(() => {
    if (previousConfig.current === config) return;
    previousConfig.current = config;
    generation.current += 1;
    setDue(false);
    setPausedRemaining(null);
    setDeadline(autoStart && enabled ? Date.now() + intervalMs : null);
  }, [autoStart, config, enabled, intervalMs]);

  useEffect(() => {
    if (!deadline) {
      setDue(false);
      return;
    }
    const wait = deadline - Date.now();
    const currentGeneration = generation.current;
    if (wait <= 0) {
      if (currentGeneration === generation.current) setDue(true);
      return;
    }
    const timeout = window.setTimeout(() => {
      if (currentGeneration === generation.current) setDue(true);
    }, wait);
    return () => window.clearTimeout(timeout);
  }, [deadline]);

  const begin = useCallback((duration = intervalMs) => {
    generation.current += 1;
    setDue(false);
    setPausedRemaining(null);
    setDeadline(Date.now() + duration);
  }, [intervalMs]);

  return {
    deadline,
    pausedRemaining,
    due,
    // `onClick` passes a MouseEvent as its first argument, so expose a
    // zero-argument action rather than handing `begin` to the button.
    start: () => begin(),
    confirm: () => begin(),
    snooze: () => begin(snoozeMs),
    resume: () => begin(pausedRemaining ?? intervalMs),
    pause: () => {
      generation.current += 1;
      setDue(false);
      setPausedRemaining(deadline ? Math.max(0, deadline - Date.now()) : null);
      setDeadline(null);
    },
  };
}

export const hydrationModule: IslandModule = {
  id: "hydration",
  title: "hydration.title",
  settingsIcon: <WaterDropIcon size={15} />,
  enabledByDefault: false,
  settings: Object.values(hydrationSettings),
  SettingsSection: HydrationSettings,
  useView(): ModuleView {
    const t = useT();
    const enabled = useSetting(moduleEnabled(hydrationModule));
    const autoStart = useSetting(hydrationSettings.autoStart);
    const showBubble = useSetting(hydrationSettings.showBubble);
    const interval = useSetting(hydrationInterval);
    const snooze = useSetting(hydrationSnooze);
    const timer = useHydrationTimer(interval, snooze, autoStart, enabled);

    return {
      active: timer.due,
      priority: 65,
      accent: "#45c4e6",
      icon: <WaterDropIcon size={15} color="#45c4e6" />,
      compact: timer.due ? {
        left: <span className="hydration-compact"><WaterDropIcon size={15} color="#45c4e6" />{t("hydration.titleDue")}</span>,
        right: <span className="hydration-compact-action">{t("hydration.reminder")}</span>,
        width: 265,
      } : undefined,
      ambient: showBubble && timer.deadline ? <HydrationBubble deadline={timer.deadline} due={timer.due} /> : undefined,
      expanded: <HydrationPanel deadline={timer.deadline} pausedRemaining={timer.pausedRemaining} due={timer.due} onConfirm={timer.confirm} onSnooze={timer.snooze} onStart={timer.start} onResume={timer.resume} onPause={timer.pause} />,
      expandedSize: { width: 560, height: 128 },
      // This changes exactly once per reminder and lets the shared controller
      // expand the module without changing any other island interaction.
      activityKey: timer.due ? `due:${timer.deadline}` : undefined,
      attention: timer.due,
      forceExpanded: timer.due,
    };
  },
};

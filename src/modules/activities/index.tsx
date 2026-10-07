/**
 * Live activities — alerts and ongoing activities from the local HTTP API,
 * plus the system's own (volume, battery, Bluetooth headphones) and alerts
 * other modules raise (a Windows notification arriving, Claude answering).
 * Backend: `src-tauri/src/providers/activities/`.
 *
 * An alert (with an expiry) takes over the compact island until it runs out;
 * ongoing activities stay until removed and are listed in the panel.
 */
import { Badge, Glyph } from "../../components/Glyph";
import { useProvider } from "../../core/bridge";
import { moduleEnabled, readSetting, useSettings } from "../../core/settings";
import type { IslandModule, ModuleView } from "../../core/types";
import { ActivityCard } from "./components/ActivityCard";
import { ActivityCompactLeft, ActivityCompactRight } from "./components/ActivityCompact";
import { ApiSettings } from "./components/ApiSettings";
import { activitySettings, SOURCE_SETTING } from "./settings";
import { ACTIVITIES_PROVIDER, type ActivitiesState, type Activity } from "./types";
import "./activities.css";

const ROW = 58;
const MAX_ROWS = 4;

/** Sources owned by other modules: shown only while that module is on. */
const MODULE_SOURCES: Record<string, string> = {
  notification: "notifications",
  ask: "ask",
};

export const activitiesModule: IslandModule = {
  id: "activities",
  title: "activities.title",
  settingsIcon: <Glyph name="sync" size={14} />,
  settings: Object.values(activitySettings),
  SettingsSection: ApiSettings,
  useView(): ModuleView {
    const state = useProvider<ActivitiesState>(ACTIVITIES_PROVIDER);
    const settings = useSettings();

    const shown = (a: Activity) => {
      const owner = MODULE_SOURCES[a.source];
      if (owner) return readSetting(settings, moduleEnabled(owner, "activities.title"));
      return readSetting(settings, SOURCE_SETTING[a.source] ?? activitySettings.api);
    };
    const items = (state?.items ?? []).filter(shown);
    const alert = items.find((a) => a.expiresAt != null);
    const ongoing = items.filter((a) => a.expiresAt == null);
    const top = alert ?? ongoing[0];

    return {
      active: !!top,
      priority: top?.priority ?? 0,
      hidden: !top,
      accent: top?.color ?? undefined,
      icon: top ? <Badge icon={top.icon} image={top.image} color={top.color ?? "#fff"} size={22} glyphSize={11} /> : <Glyph name="sync" size={14} />,
      compact: top && {
        left: <ActivityCompactLeft activity={top} />,
        right: <ActivityCompactRight activity={top} />,
        width: top.style === "level" ? 300 : 340,
      },
      expanded: alert ? (
        <div className="activities-panel">
          <ActivityCard activity={alert} />
        </div>
      ) : (
        <div className="activities-panel" data-scroll>
          {ongoing.map((a) => (
            <ActivityCard key={a.id} activity={a} compact />
          ))}
        </div>
      ),
      expandedSize: alert
        ? { width: 560, height: alert.progress != null || alert.subtitle ? 128 : 104 }
        : { width: 560, height: 40 + Math.min(Math.max(ongoing.length, 1), MAX_ROWS) * ROW },
      // Alerts that ask for it (notifications, low battery, "Claude answered") open the island.
      activityKey: alert?.expand ? `${alert.id}:${alert.updatedAt}` : undefined,
    };
  },
};

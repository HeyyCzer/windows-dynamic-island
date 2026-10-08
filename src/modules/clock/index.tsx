/**
 * Clock — the time, and a month calendar to look up dates, as a tab of the
 * open island. (In the Windows Island style the resting pill also shows the
 * time; see `IdleClock`.)
 *
 * With a Google account or iCal links connected (backend:
 * `src-tauri/src/providers/calendar/`), busy days get a dot per calendar, the
 * focused day lists its events, and the next event takes over the island a
 * few minutes before it starts.
 */
import { Glyph } from "../../components/Glyph";
import { Marquee } from "../../components/Marquee";
import { useProvider } from "../../core/bridge";
import { useLocale, useT } from "../../core/i18n";
import { useSetting } from "../../core/settings";
import type { IslandModule, ModuleView } from "../../core/types";
import { useNow } from "../ai-agents/common/format";
import { CalendarSettings } from "./components/CalendarSettings";
import { ClockPanel } from "./components/ClockPanel";
import { dueEvent, nextStart } from "./events";
import { calendarSettings, remindMinutes } from "./settings";
import { CALENDAR_PROVIDER, CLOCK_RED, type CalEvent, type CalendarState } from "./types";
import "./clock.css";

/** Panel height with the day's event list under the date. */
const HEIGHT_WITH_EVENTS = 236;

function ReminderLeft({ event, color }: { event: CalEvent; color: string }) {
  const t = useT();
  return (
    <>
      <span className="clock-remind-icon" style={{ background: `${color}29` }}>
        <Glyph name="calendar" size={12} color={color} />
      </span>
      <Marquee text={event.title || t("calendar.untitled")} className="clock-remind-title" />
    </>
  );
}

function ReminderRight({ event, now, color }: { event: CalEvent; now: number; color: string }) {
  const t = useT();
  const locale = useLocale();
  const minutes = Math.ceil((event.start - now) / 60_000);
  return (
    <span className="clock-remind-when" style={{ color }}>
      {minutes <= 0
        ? t("calendar.now")
        : new Intl.RelativeTimeFormat(locale, { style: "short" }).format(minutes, "minute")}
    </span>
  );
}

export const clockModule: IslandModule = {
  id: "clock",
  title: "clock.title",
  settingsIcon: <Glyph name="calendar" size={14} />,
  settings: Object.values(calendarSettings),
  SettingsSection: CalendarSettings,
  useView(): ModuleView {
    const calendar = useProvider<CalendarState>(CALENDAR_PROVIDER);
    const remind = useSetting(calendarSettings.remind);
    const lead = useSetting(remindMinutes) * 60_000;
    const events = calendar?.events ?? [];

    // Tick only while an event is close; otherwise a slow clock notices the next one coming.
    const coarse = useNow(30_000);
    const close = remind && !!(dueEvent(events, coarse, lead) ?? nextStart(events, coarse, lead + 60_000));
    const fine = useNow(5_000, close);
    const now = close ? Math.max(fine, coarse) : coarse;
    const due = remind ? dueEvent(events, now, lead) : undefined;
    const color = (due && calendar?.calendars.find((c) => c.key === due.calendar)?.color) || CLOCK_RED;
    const started = !!due && now >= due.start;

    return {
      active: !!due,
      // A meeting about to start beats music, under Ask Claude and the system alerts.
      priority: 55,
      accent: CLOCK_RED,
      icon: <Glyph name="calendar" size={14} />,
      compact: due && {
        left: <ReminderLeft event={due} color={color} />,
        right: <ReminderRight event={due} now={now} color={color} />,
        width: 320,
      },
      expanded: <ClockPanel calendar={calendar} highlight={due?.id} />,
      expandedSize: { width: 560, height: calendar?.calendars.length ? HEIGHT_WITH_EVENTS : 214 },
      // Peeks when the reminder shows up, and again when the event starts.
      activityKey: due ? `${due.id}:${started ? "start" : "soon"}` : undefined,
    };
  },
};

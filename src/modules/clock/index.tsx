import { CalendarIcon } from "lucide-react";
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
import { useEffect, useMemo, useRef } from "react";
import { Marquee } from "../../components/Marquee";
import { providerAction, useProvider } from "../../core/bridge";
import { useLocale, useT } from "../../core/i18n";
import { useSetting } from "../../core/settings";
import type { IslandModule, ModuleView } from "../../core/types";
import { useNow } from "../ai-agents/common/format";
import { CalendarSettings } from "./components/CalendarSettings";
import { ClockPanel } from "./components/ClockPanel";
import { dueReminder, type LeadsOf, reminderSoon } from "./events";
import { calendarSettings, eventReminders, leadList, remindMinutes, remindSound } from "./settings";
import { CALENDAR_PROVIDER, type CalEvent, type CalendarState, CLOCK_RED } from "./types";

/** Panel height with the day's event list under the date. */
const HEIGHT_WITH_EVENTS = 236;

function ReminderLeft({ event, color }: { event: CalEvent; color: string }) {
	const t = useT();
	return (
		<>
			<span className="grid size-6 flex-none place-items-center rounded-[7px]" style={{ background: `${color}29` }}>
				<CalendarIcon size={12} color={color} />
			</span>
			<Marquee text={event.title || t("calendar.untitled")} className="max-w-47.5 min-w-0 text-[13px] font-semibold" />
		</>
	);
}

function ReminderRight({ event, now, color }: { event: CalEvent; now: number; color: string }) {
	const t = useT();
	const locale = useLocale();
	const minutes = Math.ceil((event.start - now) / 60_000);
	const format = new Intl.RelativeTimeFormat(locale, { style: "short" });
	return (
		<span className="text-[12px] font-[650] whitespace-nowrap tabular-nums" style={{ color }}>
			{minutes <= 0
				? t("calendar.now")
				: minutes < 60
					? format.format(minutes, "minute")
					: minutes < 1440
						? format.format(Math.round(minutes / 60), "hour")
						: format.format(Math.round(minutes / 1440), "day")}
		</span>
	);
}

export const clockModule: IslandModule = {
	id: "clock",
	title: "clock.title",
	settingsIcon: <CalendarIcon size={14} />,
	settings: Object.values(calendarSettings),
	SettingsSection: CalendarSettings,
	useView(): ModuleView {
		const calendar = useProvider<CalendarState>(CALENDAR_PROVIDER);
		const remind = useSetting(calendarSettings.remind);
		const minutes = useSetting(remindMinutes);
		const ownReminders = useSetting(eventReminders);
		const sound = useSetting(remindSound);
		const leadsOf = useMemo<LeadsOf>(() => {
			const leads = leadList(minutes);
			return (e) => (ownReminders && e.reminders?.length ? e.reminders : leads);
		}, [minutes, ownReminders]);
		const events = calendar?.events ?? [];

		// Tick only while a reminder is close; otherwise a slow clock notices the next one coming.
		const coarse = useNow(30_000);
		const close = remind && !!(dueReminder(events, coarse, leadsOf) || reminderSoon(events, coarse, 60_000, leadsOf));
		const fine = useNow(5_000, close);
		const now = close ? Math.max(fine, coarse) : coarse;
		const reminder = remind ? dueReminder(events, now, leadsOf) : undefined;
		const due = reminder?.event;
		const color = (due && calendar?.calendars.find((c) => c.key === due.calendar)?.color) || CLOCK_RED;
		const started = !!due && now >= due.start;
		const activityKey = reminder ? `${reminder.event.id}:${started ? "start" : reminder.lead}` : undefined;

		// A chime each time the island peeks for a reminder.
		const chimed = useRef<string | undefined>(undefined);
		useEffect(() => {
			if (activityKey && activityKey !== chimed.current && sound) providerAction(CALENDAR_PROVIDER, "chime");
			chimed.current = activityKey;
		}, [activityKey, sound]);

		return {
			active: !!due,
			// A meeting about to start beats music, under Ask Claude and the system alerts.
			priority: 55,
			accent: CLOCK_RED,
			icon: <CalendarIcon size={14} />,
			compact: due && {
				left: <ReminderLeft event={due} color={color} />,
				right: <ReminderRight event={due} now={now} color={color} />,
				width: 320,
			},
			expanded: <ClockPanel calendar={calendar} highlight={due?.id} />,
			expandedSize: { width: 560, height: calendar?.calendars.length ? HEIGHT_WITH_EVENTS : 214 },
			// Peeks at each reminder, and again when the event starts.
			activityKey,
		};
	},
};

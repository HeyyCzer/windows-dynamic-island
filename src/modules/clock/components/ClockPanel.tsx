import { useMemo, useState, type WheelEvent } from "react";
import { command } from "../../../core/bridge";
import { useLocale, useT } from "../../../core/i18n";
import { useNow } from "../../ai-agents/common/format";
import { DAY_MS, dayDots, eventsOn, sameDay, startOfDay } from "../events";
import type { CalEvent, CalendarState } from "../types";

/** The wheel over the calendar flips months at most this often. */
const WHEEL_STEP_MS = 220;
/** Event rows under the date; more become "+N". */
const MAX_ROWS = 3;
/** "Join" shows from this long before a call. */
const JOIN_LEAD_MS = 15 * 60_000;

/** First day of the week for a locale (1 = Monday … 7 = Sunday). */
function firstDayOfWeek(locale: string): number {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    return (l.getWeekInfo?.() ?? l.weekInfo)?.firstDay ?? 1;
  } catch {
    return 1;
  }
}

/** ISO week number (Monday weeks; week 1 holds the first Thursday). */
function isoWeek(d: Date): number {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const week1 = new Date(t.getFullYear(), 0, 4);
  return 1 + Math.round(((t.getTime() - week1.getTime()) / DAY_MS - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

/** Six rows of seven days covering `month`, starting on the locale's first weekday. */
function monthGrid(month: Date, firstDay: number): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() - (firstDay % 7) + 7) % 7;
  return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + i));
}

const openLink = (url: string | null) => {
  if (url?.startsWith("https://")) command("open_external", { url });
};

/** Clock, the focused day's events, and the month with a dot per calendar on busy days. */
export function ClockPanel({ calendar, highlight }: { calendar?: CalendarState; highlight?: string }) {
  const t = useT();
  const locale = useLocale();
  const now = useNow(1000);
  const today = new Date(now);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date | null>(null);

  const events = calendar?.events;
  const calendars = calendar?.calendars;
  const dots = useMemo(() => dayDots(events ?? [], calendars ?? []), [events, calendars]);
  const colors = useMemo(() => new Map((calendars ?? []).map((c) => [c.key, c.color])), [calendars]);
  const hasSources = !!calendars?.length;

  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(now);
  const seconds = String(today.getSeconds()).padStart(2, "0");
  const firstDay = firstDayOfWeek(locale);
  const days = monthGrid(month, firstDay);
  // Trim a trailing week that belongs entirely to the next month.
  const rows = days.slice(35).every((d) => d.getMonth() !== month.getMonth()) ? 5 : 6;
  const weekdays = days.slice(0, 7).map((d) => new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(d));
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month);
  const onCurrentMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

  // Left side: today, or the picked day and how far away it is.
  const focus = selected ?? today;
  const longDate = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(focus);
  const distance = Math.round((startOfDay(focus).getTime() - startOfDay(today).getTime()) / DAY_MS);
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(distance, "day");
  // Today lists what's left of it; other days list everything.
  const dayEvents = eventsOn(events ?? [], focus).filter((e) => !sameDay(focus, today) || e.allDay || e.end > now);
  const shown = dayEvents.slice(0, dayEvents.length > MAX_ROWS ? MAX_ROWS - 1 : MAX_ROWS);
  const hourFormat = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const goToday = () => {
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelected(null);
  };

  const [lastWheel, setLastWheel] = useState(0);
  const onWheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaY) < 4 || e.timeStamp - lastWheel < WHEEL_STEP_MS) return;
    setLastWheel(e.timeStamp);
    shift(Math.sign(e.deltaY));
  };

  const row = (e: CalEvent) => {
    const live = e.start <= now && now < e.end;
    const joinable = !!e.meetingUrl && !e.allDay && e.start - JOIN_LEAD_MS <= now && now < e.end;
    return (
      <li
        key={e.id}
        className={`clock-event ${live ? "is-live" : ""} ${e.id === highlight ? "is-due" : ""}`}
        style={{ "--cal-color": colors.get(e.calendar) ?? "#8E8E93" } as React.CSSProperties}
        title={[e.title, e.location].filter(Boolean).join("\n")}
        onClick={() => openLink(e.url)}
      >
        <span className="clock-event-time">
          {e.allDay ? t("calendar.allDay") : e.start < startOfDay(focus).getTime() ? "…" : hourFormat.format(e.start)}
        </span>
        <span className="clock-event-title">{e.title || t("calendar.untitled")}</span>
        {joinable && (
          <button
            className="clock-event-join"
            onClick={(ev) => {
              ev.stopPropagation();
              openLink(e.meetingUrl);
            }}
          >
            {t("calendar.join")}
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="clock-panel" onClick={(e) => e.stopPropagation()}>
      <div className={`clock-main ${hasSources ? "has-events" : ""}`}>
        <span className="clock-time">
          {time}
          <span className="clock-seconds">{seconds}</span>
        </span>
        <span className="clock-date">{longDate}</span>
        <span className="clock-meta">
          {selected && !sameDay(selected, today) ? relative : t("clock.week", { n: isoWeek(focus) })}
        </span>
        {hasSources && (
          <ul className="clock-events">
            {shown.map(row)}
            {dayEvents.length > shown.length && (
              <li className="clock-event-more">{t("calendar.more", { n: dayEvents.length - shown.length })}</li>
            )}
            {dayEvents.length === 0 && <li className="clock-event-more">{t("calendar.free")}</li>}
          </ul>
        )}
      </div>

      <div className="clock-cal" data-scroll onWheel={onWheel}>
        <div className="clock-cal-head">
          <span className="clock-cal-month">{monthLabel}</span>
          {(!onCurrentMonth || selected) && (
            <button className="clock-cal-today" onClick={goToday}>
              {t("clock.today")}
            </button>
          )}
          <button className="clock-cal-nav" title={t("clock.prev")} onClick={() => shift(-1)}>
            ‹
          </button>
          <button className="clock-cal-nav" title={t("clock.next")} onClick={() => shift(1)}>
            ›
          </button>
        </div>
        <div className="clock-cal-grid">
          {weekdays.map((w, i) => (
            <span key={`w${i}`} className="clock-cal-weekday">
              {w}
            </span>
          ))}
          {days.slice(0, rows * 7).map((d) => {
            const classes = [
              "clock-cal-day",
              d.getMonth() !== month.getMonth() && "is-other",
              sameDay(d, today) && "is-today",
              selected && sameDay(d, selected) && "is-selected",
              (d.getDay() === 0 || d.getDay() === 6) && "is-weekend",
            ]
              .filter(Boolean)
              .join(" ");
            const marks = dots.get(d.toDateString());
            return (
              <button
                key={d.toDateString()}
                className={classes}
                onClick={() => {
                  setSelected(sameDay(d, today) ? null : d);
                  if (d.getMonth() !== month.getMonth()) setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                }}
              >
                {d.getDate()}
                {marks && (
                  <span className="clock-cal-dots">
                    {marks.map((c) => (
                      <i key={c} style={{ background: c }} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

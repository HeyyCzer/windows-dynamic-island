/**
 * Clock — the time, and a month calendar to look up dates, as a tab of the
 * open island. (In the Windows Island style the resting pill also shows the
 * time; see `IdleClock`.)
 */
import { useState, type WheelEvent } from "react";
import { Glyph } from "../../components/Glyph";
import { useLocale, useT } from "../../core/i18n";
import type { IslandModule, ModuleView } from "../../core/types";
import { useNow } from "../ai-agents/common/format";
import "./clock.css";

const DAY_MS = 86_400_000;
/** The wheel over the calendar flips months at most this often. */
const WHEEL_STEP_MS = 220;

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

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Six rows of seven days covering `month`, starting on the locale's first weekday. */
function monthGrid(month: Date, firstDay: number): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() - (firstDay % 7) + 7) % 7;
  return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + i));
}

function ClockPanel() {
  const t = useT();
  const locale = useLocale();
  const now = useNow(1000);
  const today = new Date(now);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date | null>(null);

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

  return (
    <div className="clock-panel" onClick={(e) => e.stopPropagation()}>
      <div className="clock-main">
        <span className="clock-time">
          {time}
          <span className="clock-seconds">{seconds}</span>
        </span>
        <span className="clock-date">{longDate}</span>
        <span className="clock-meta">
          {selected && !sameDay(selected, today) ? relative : t("clock.week", { n: isoWeek(focus) })}
        </span>
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
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const clockModule: IslandModule = {
  id: "clock",
  title: "clock.title",
  settingsIcon: <Glyph name="calendar" size={14} />,
  useView(): ModuleView {
    return {
      active: false,
      priority: 0,
      accent: "#FF453A",
      icon: <Glyph name="calendar" size={14} />,
      expanded: <ClockPanel />,
      expandedSize: { width: 560, height: 214 },
    };
  },
};

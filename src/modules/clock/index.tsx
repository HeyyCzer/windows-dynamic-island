/**
 * Clock — the time and date, as a tab of the open island. (In the Windows
 * Island style the resting pill also shows the time; see `IdleClock`.)
 */
import { Glyph } from "../../components/Glyph";
import { useLocale } from "../../core/i18n";
import type { IslandModule, ModuleView } from "../../core/types";
import { useNow } from "../ai-agents/common/format";
import "./clock.css";

function ClockPanel() {
  const locale = useLocale();
  const now = useNow(1000);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(now);
  const seconds = String(new Date(now).getSeconds()).padStart(2, "0");
  const date = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(now);
  const today = new Date(now);
  // This week, Monday first.
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const dayName = new Intl.DateTimeFormat(locale, { weekday: "narrow" });

  return (
    <div className="clock-panel">
      <div className="clock-main">
        <span className="clock-time">
          {time}
          <span className="clock-seconds">{seconds}</span>
        </span>
        <span className="clock-date">{date}</span>
      </div>
      <div className="clock-week">
        {week.map((d) => {
          const isToday = d.toDateString() === today.toDateString();
          return (
            <span key={d.toDateString()} className={`clock-day ${isToday ? "is-today" : ""}`}>
              <span className="clock-day-name">{dayName.format(d)}</span>
              <span className="clock-day-num">{d.getDate()}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export const clockModule: IslandModule = {
  id: "clock",
  title: "clock.title",
  settingsIcon: <Glyph name="clock" size={14} />,
  useView(): ModuleView {
    return {
      active: false,
      priority: 0,
      accent: "#AEAEB2",
      icon: <Glyph name="clock" size={14} />,
      expanded: <ClockPanel />,
      expandedSize: { width: 560, height: 120 },
    };
  },
};

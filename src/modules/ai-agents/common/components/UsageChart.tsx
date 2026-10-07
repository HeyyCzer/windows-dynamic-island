import { useLocale, useT } from "../../../../core/i18n";
import { formatTokens } from "../format";
import type { UsageHistory } from "../types";

const MAX_BAR = 34;

/**
 * Tokens per day for the last 7 days: one hue (the agent's), today at full
 * strength, earlier days softer; the exact numbers in each column's tooltip.
 * Beside it, the totals for the week and the last 5 hours (today's are in
 * the agent card above).
 */
export function UsageChart({ usage, color }: { usage: UsageHistory; color: string }) {
  const t = useT();
  const locale = useLocale();
  const days = usage.daily;
  if (!days.length) return null;
  const peak = Math.max(1, ...days.map((d) => d.tokens));
  const week = days.reduce((n, d) => n + d.tokens, 0);
  const weekResponses = days.reduce((n, d) => n + d.responses, 0);
  const dayName = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const fullDate = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "short" });
  const responses = (n: number) => t(n === 1 ? "agents.usage.response" : "agents.usage.responses", { n });

  return (
    <div className="agents-usage" style={{ "--agent": color } as React.CSSProperties}>
      <div className="agents-usage-stats">
        <Stat label={t("agents.usage.week")} value={formatTokens(week)} sub={responses(weekResponses)} />
        <Stat label={t("agents.usage.last5h")} value={formatTokens(usage.last5hTokens)} />
      </div>
      <div className="agents-usage-chart">
        {days.map((d, i) => {
          const isToday = i === days.length - 1;
          // Noon avoids the date shifting across time zones.
          const date = new Date(`${d.date}T12:00:00`);
          const height = d.tokens ? Math.max(4, (MAX_BAR * d.tokens) / peak) : 2;
          return (
            <div
              key={d.date}
              className={`agents-usage-col ${isToday ? "is-today" : ""}`}
              title={`${fullDate.format(date)}\n${formatTokens(d.tokens)} tokens · ${responses(d.responses)}`}
            >
              <div className="agents-usage-bar-area">
                <div className={`agents-usage-bar ${d.tokens ? "" : "is-empty"}`} style={{ height }} />
              </div>
              <span className="agents-usage-day">{isToday ? t("agents.usage.todayShort") : dayName.format(date).replace(".", "")}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="agents-usage-stat">
      <span className="agents-section-label">{label}</span>
      <span className="agents-usage-value">{value}</span>
      {sub && <span className="agents-usage-sub">{sub}</span>}
    </div>
  );
}

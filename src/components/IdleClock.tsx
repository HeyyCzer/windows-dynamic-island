import { useLocale } from "../core/i18n";
import { useNow } from "../modules/ai-agents/common/format";

/** Time in the resting pill (Windows Island style). */
export function IdleClock() {
  const locale = useLocale();
  const now = useNow(5_000);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(now);
  return <div className="idle-clock">{time}</div>;
}

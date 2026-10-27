import { useEffect, useState } from "react";
import { useT } from "../../../core/i18n";
import { setSetting, useSetting } from "../../../core/settings";
import { hydrationInterval, hydrationSnooze } from "../settings";

const INTERVALS = [15, 30, 45, 60, 90, 120];
const SNOOZES = [5, 10, 15, 30];
const CUSTOM = "custom";
const MAX_MINUTES = 1440;

/** Duration controls live beside the module's standard toggle settings. */
export function HydrationSettings() {
  const t = useT();
  const interval = useSetting(hydrationInterval);
  const snooze = useSetting(hydrationSnooze);
  return (
    <>
      <DurationRow label={t("hydration.interval.label")} description={t("hydration.interval.desc")} value={interval} options={INTERVALS} onChange={(value) => setSetting(hydrationInterval, value)} />
      <div className="hydration-settings-divider" />
      <DurationRow label={t("hydration.snooze.label")} description={t("hydration.snooze.desc")} value={snooze} options={SNOOZES} onChange={(value) => setSetting(hydrationSnooze, value)} />
    </>
  );
}

/** A preset picker that also accepts any whole number of minutes. */
function DurationRow({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  options: number[];
  onChange: (value: number) => void;
}) {
  const t = useT();
  const [custom, setCustom] = useState(!options.includes(value));
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(draft));
    if (Number.isFinite(n) && n >= 1 && n <= MAX_MINUTES) onChange(n);
    else setDraft(String(value));
  };

  return (
    <div className="settings-row is-static">
      <span className="settings-text">
        <span className="settings-label">{label}</span>
        <span className="settings-desc">{description}</span>
      </span>
      <span className="hydration-duration">
        {custom && (
          <span className="settings-number">
            <input
              type="number"
              min={1}
              max={MAX_MINUTES}
              step={1}
              value={draft}
              aria-label={label}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
            <span className="settings-unit">min</span>
          </span>
        )}
        <select
          className="settings-select"
          value={custom ? CUSTOM : value}
          aria-label={label}
          onChange={(e) => {
            if (e.target.value === CUSTOM) return setCustom(true);
            setCustom(false);
            onChange(Number(e.target.value));
          }}
        >
          {options.map((minutes) => <option key={minutes} value={minutes}>{t("hydration.minutes", { n: minutes })}</option>)}
          <option value={CUSTOM}>{t("hydration.custom")}</option>
        </select>
      </span>
    </div>
  );
}

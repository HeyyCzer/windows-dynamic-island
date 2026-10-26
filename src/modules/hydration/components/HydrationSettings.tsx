import { useT } from "../../../core/i18n";
import { setSetting, useSetting } from "../../../core/settings";
import { hydrationInterval, hydrationSnooze } from "../settings";

const INTERVALS = [15, 30, 45, 60, 90, 120];
const SNOOZES = [5, 10, 15, 30];

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
  return (
    <label className="settings-row is-static">
      <span className="settings-text">
        <span className="settings-label">{label}</span>
        <span className="settings-desc">{description}</span>
      </span>
      <select className="settings-select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {options.map((minutes) => <option key={minutes} value={minutes}>{t("hydration.minutes", { n: minutes })}</option>)}
      </select>
    </label>
  );
}

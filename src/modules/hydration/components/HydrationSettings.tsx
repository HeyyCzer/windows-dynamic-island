import { useEffect, useState } from "react";
import { Divider, Row } from "../../../components/ui/card";
import { NumberField, Select } from "../../../components/ui/form";
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
			<DurationRow
				label={t("hydration.interval.label")}
				description={t("hydration.interval.desc")}
				value={interval}
				options={INTERVALS}
				onChange={(value) => setSetting(hydrationInterval, value)}
			/>
			<Divider />
			<DurationRow
				label={t("hydration.snooze.label")}
				description={t("hydration.snooze.desc")}
				value={snooze}
				options={SNOOZES}
				onChange={(value) => setSetting(hydrationSnooze, value)}
			/>
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
		<Row label={label} desc={description}>
			<span className="flex flex-none items-center gap-2">
				{custom && (
					<NumberField
						unit="min"
						min={1}
						max={MAX_MINUTES}
						step={1}
						value={draft}
						aria-label={label}
						onChange={(e) => setDraft(e.target.value)}
						onBlur={commit}
						onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
					/>
				)}
				<Select
					value={custom ? CUSTOM : value}
					aria-label={label}
					onChange={(e) => {
						if (e.target.value === CUSTOM) return setCustom(true);
						setCustom(false);
						onChange(Number(e.target.value));
					}}
				>
					{options.map((minutes) => (
						<option key={minutes} value={minutes}>
							{t("hydration.minutes", { n: minutes })}
						</option>
					))}
					<option value={CUSTOM}>{t("hydration.custom")}</option>
				</Select>
			</span>
		</Row>
	);
}

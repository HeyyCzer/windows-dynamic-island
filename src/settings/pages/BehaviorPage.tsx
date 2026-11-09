import { useEffect, useState } from "react";
import { Card, Row } from "../../components/ui/card";
import { NumberField, Select } from "../../components/ui/form";
import { useT } from "../../core/i18n";
import {
	behaviorSettings,
	type CloseTrigger,
	monitorSettings,
	type OpenTrigger,
	openTrigger,
	positionSettings,
	readSetting,
	setSetting,
} from "../../core/settings";
import { Title } from "../components/Heading";
import { ToggleRow } from "../components/Toggle";

/** How the island opens, closes, hides and moves. */
export function BehaviorPage({ values }: { values: Record<string, unknown> }) {
	const t = useT();
	const { openOn, closeOn, hideInFullscreen } = behaviorSettings;
	return (
		<>
			<Title>{t("behavior.title")}</Title>
			<Card>
				<Row as="label" label={t(openOn.label)} desc={t(openOn.description)}>
					<Select value={openTrigger(values)} onChange={(e) => setSetting(openOn, e.target.value as OpenTrigger)}>
						<option value="hover">{t("behavior.openOn.hover")}</option>
						<option value="click">{t("behavior.openOn.click")}</option>
					</Select>
				</Row>
				<Row as="label" label={t(closeOn.label)} desc={t(closeOn.description)}>
					<Select
						value={readSetting(values, closeOn)}
						onChange={(e) => setSetting(closeOn, e.target.value as CloseTrigger)}
					>
						<option value="leave">{t("behavior.closeOn.leave")}</option>
						<option value="clickOutside">{t("behavior.closeOn.clickOutside")}</option>
					</Select>
				</Row>
			</Card>
			<Card>
				<ToggleRow def={hideInFullscreen} value={readSetting(values, hideInFullscreen)} />
				<ToggleRow def={monitorSettings.avoidMaximized} value={readSetting(values, monitorSettings.avoidMaximized)} />
			</Card>
			<Card>
				<ToggleRow def={positionSettings.returnToCenter} value={readSetting(values, positionSettings.returnToCenter)} />
				<SecondsRow
					value={readSetting(values, positionSettings.returnDelay)}
					disabled={!readSetting(values, positionSettings.returnToCenter)}
				/>
			</Card>
		</>
	);
}

function SecondsRow({ value, disabled }: { value: number; disabled: boolean }) {
	const t = useT();
	const def = positionSettings.returnDelay;
	const [draft, setDraft] = useState(String(value));
	useEffect(() => setDraft(String(value)), [value]);
	const commit = () => {
		const n = Math.round(Number(draft));
		if (Number.isFinite(n) && n >= 1 && n <= 3600) setSetting(def, n);
		else setDraft(String(value));
	};

	return (
		<Row as="label" label={t(def.label)} desc={t(def.description)} disabled={disabled}>
			<NumberField
				unit="s"
				min={1}
				max={3600}
				step={1}
				value={draft}
				disabled={disabled}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
			/>
		</Row>
	);
}

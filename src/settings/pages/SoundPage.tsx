import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Card, Row } from "../../components/ui/card";
import { providerAction } from "../../core/bridge";
import { useT } from "../../core/i18n";
import { readSetting, setSetting, soundSettings } from "../../core/settings";
import { Lead, Title } from "../components/Heading";

/** The app's sounds: how loud they play, and where each one is chosen. */
export function SoundPage({ values }: { values: Record<string, unknown> }) {
	const t = useT();
	const navigate = useNavigate();
	return (
		<>
			<Title>{t("sound.title")}</Title>
			<Lead>{t("sound.lead")}</Lead>
			<Card>
				<VolumeRow value={readSetting(values, soundSettings.volume)} />
			</Card>
			<Card>
				<Row label={t("sound.agents.label")} desc={t("sound.agents.desc")}>
					<Button onClick={() => navigate("/modules/ai-agents")}>{t("sound.agents.open")}</Button>
				</Row>
			</Card>
		</>
	);
}

/** A slider; the setting (and a sample at the new volume) once it's let go. */
function VolumeRow({ value }: { value: number }) {
	const t = useT();
	const [draft, setDraft] = useState(value);
	useEffect(() => setDraft(value), [value]);
	const commit = () => {
		if (draft === value) return;
		setSetting(soundSettings.volume, draft);
		// The backend reads the volume from the settings: let the write land first.
		window.setTimeout(() => providerAction("claude", "testSound", "done").catch(() => {}), 80);
	};

	return (
		<Row label={t(soundSettings.volume.label)} desc={t("sound.volume.desc")}>
			<div className="flex items-center gap-3">
				<input
					type="range"
					min={0}
					max={100}
					step={5}
					value={draft}
					aria-label={t(soundSettings.volume.label)}
					className="w-40 accent-accent"
					onChange={(e) => setDraft(Number(e.target.value))}
					onPointerUp={commit}
					onKeyUp={commit}
				/>
				<span className="w-9 text-right text-[12.5px] text-text-dim tabular-nums">{draft}%</span>
			</div>
		</Row>
	);
}

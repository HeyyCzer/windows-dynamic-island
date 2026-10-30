import { useState } from "react";
import { AppLogo, GitHubIcon } from "../../components/icons";
import { Button } from "../../components/ui/button";
import { Card, Row } from "../../components/ui/card";
import { command, isTauri } from "../../core/bridge";
import { useT } from "../../core/i18n";

const REPO_URL = "https://github.com/HeyyCzer/windows-island";

type UpdateStatus =
	| { state: "idle" | "checking" | "latest" | "dev" | "portable" | "error" }
	| { state: "ready"; version: string };

/** Manual update check; a found update is downloaded and installed on demand. */
function UpdateRow() {
	const t = useT();
	const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });

	const check = async () => {
		setStatus({ state: "checking" });
		try {
			const version = await command<string | null>("check_update");
			setStatus(version ? { state: "ready", version } : { state: "latest" });
		} catch (e) {
			setStatus({ state: e === "dev" || e === "portable" ? (e as "dev" | "portable") : "error" });
		}
	};

	const desc =
		status.state === "ready"
			? t("settings.about.updates.ready", { version: status.version })
			: t(`settings.about.updates.${status.state}`);

	return (
		<Row label={t("settings.about.updates.label")} desc={desc}>
			{status.state === "ready" ? (
				<Button variant="primary" onClick={() => command("install_update")}>
					{t("settings.about.updates.install")}
				</Button>
			) : (
				<Button onClick={check} disabled={status.state === "checking"}>
					{t("settings.about.updates.check")}
				</Button>
			)}
		</Row>
	);
}

export function AboutPage() {
	const t = useT();
	const openRepo = () => (isTauri ? command("open_repo") : window.open(REPO_URL, "_blank"));

	return (
		<>
			<div className="flex flex-col items-center gap-2.5 pt-4.5 pb-2.5 [&_svg]:drop-shadow-[0_8px_24px_rgba(143,148,255,0.18)]">
				<AppLogo size={72} />
				<div className="mt-1 text-[22px] font-bold tracking-[-0.015em]">Island for Windows</div>
				<span className="rounded-full bg-white/6 px-2.5 py-0.75 text-[12px] font-semibold text-text-dim tabular-nums">
					{t("settings.about.version", { version: __APP_VERSION__ })}
				</span>
			</div>
			<Card>
				<Row label={t("settings.about.source")} desc={REPO_URL.replace("https://", "")}>
					<Button onClick={openRepo}>
						<GitHubIcon size={14} />
						GitHub
					</Button>
				</Row>
				<UpdateRow />
				<Row label={t("settings.about.license")} desc="GNU GPL v3.0"></Row>
			</Card>
		</>
	);
}

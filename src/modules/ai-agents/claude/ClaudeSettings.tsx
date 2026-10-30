import { useState } from "react";
import { Button, LinkButton } from "../../../components/ui/button";
import { Block, Desc, Row } from "../../../components/ui/card";
import { Chip, Chips } from "../../../components/ui/text";
import { providerAction, useProvider } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { setSetting, useSetting } from "../../../core/settings";
import { Toggle } from "../../../settings/components/Toggle";
import { claudeSounds } from "../settings";

interface IntegrationState {
	integration: { hooks: boolean; statusline: boolean; serverOk: boolean; permissions: boolean };
}

/** Claude Code integration status + install/remove, and the alert sounds, for the settings window. */
export function ClaudeSettings() {
	return (
		<>
			<Integration />
			<SoundRow kind="done" />
			<SoundRow kind="permission" />
		</>
	);
}

function Integration() {
	const state = useProvider<IntegrationState>("claude");
	const t = useT();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const i = state?.integration;
	const installed = !!i?.hooks && !!i?.statusline;
	// Installed by an older version: the permission hook needs a longer timeout.
	const outdated = installed && !i?.permissions;

	const run = async (action: "install" | "uninstall") => {
		setBusy(true);
		setError(null);
		try {
			await providerAction("claude", action);
		} catch (e) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Block>
			<Row
				label={t("claude.integration.title")}
				desc={t("claude.integration.desc", { file: "~/.claude/settings.json" })}
			>
				{outdated && (
					<Button variant="primary" disabled={busy} onClick={() => run("install")}>
						{busy ? "…" : t("claude.setup.update")}
					</Button>
				)}
				<Button
					variant={installed ? "danger" : "primary"}
					disabled={busy || !state}
					onClick={() => run(installed ? "uninstall" : "install")}
				>
					{busy ? "…" : installed ? t("claude.integration.remove") : t("claude.integration.enable")}
				</Button>
			</Row>
			<Chips>
				<Chip ok={!!i?.hooks}>Hooks</Chip>
				<Chip ok={!!i?.statusline}>Statusline</Chip>
				<Chip ok={!!i?.permissions}>{t("claude.integration.permissions")}</Chip>
				<Chip ok={!!i?.serverOk}>{t("claude.integration.server")}</Chip>
			</Chips>
			{installed && <Desc>{t("claude.integration.restart")}</Desc>}
			{error && <Desc tone="error">{error}</Desc>}
		</Block>
	);
}

/** A sound on/off, the file it plays, a picker and a preview. */
function SoundRow({ kind }: { kind: keyof typeof claudeSounds }) {
	const t = useT();
	const defs = claudeSounds[kind];
	const enabled = useSetting(defs.enabled);
	const file = useSetting(defs.file);
	const name = file ? file.split(/[\\/]/).pop() : t("claude.sound.default");

	const pick = async () => {
		const path = await providerAction<string | null>("claude", "pickSound");
		if (path) setSetting(defs.file, path);
	};

	return (
		<Row
			label={t(defs.enabled.label)}
			desc={
				<span title={file ?? undefined}>
					{name}
					{" · "}
					<LinkButton tone="text" onClick={() => providerAction("claude", "testSound", kind)}>
						{t("claude.sound.test")}
					</LinkButton>
					{" · "}
					<LinkButton tone="text" onClick={pick}>
						{t("claude.sound.choose")}
					</LinkButton>
					{file && (
						<>
							{" · "}
							<LinkButton tone="text" onClick={() => setSetting(defs.file, null)}>
								{t("claude.sound.reset")}
							</LinkButton>
						</>
					)}
				</span>
			}
		>
			<Toggle checked={enabled} onChange={(v) => setSetting(defs.enabled, v)} />
		</Row>
	);
}

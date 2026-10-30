import { type FormEvent, useState } from "react";
import { Button, LinkButton } from "../../../components/ui/button";
import { Block, Desc, Row } from "../../../components/ui/card";
import { Input } from "../../../components/ui/form";
import { command, providerAction, useProvider } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { MUSIC_PROVIDER } from "../hooks/useMusic";

const DASHBOARD_URL = "https://developer.spotify.com/dashboard";
/** Must match `REDIRECT` in `src-tauri/src/providers/music/spotify.rs`. */
const REDIRECT = "http://127.0.0.1:43821/callback";
const ERRORS = [
	"premium",
	"noDevice",
	"unauthorized",
	"network",
	"http",
	"rateLimited",
	"invalid",
	"timeout",
	"denied",
	"portBusy",
	"noClient",
];

/** Mirrors `Status` in `src-tauri/src/providers/music/spotify.rs`. */
interface SpotifyStatus {
	hasClient: boolean;
	connected: boolean;
	error: string | null;
}

const errorText = (t: ReturnType<typeof useT>, code: string) =>
	ERRORS.includes(code) ? t(`music.spotify.error.${code}` as Parameters<typeof t>[0]) : code;

/** Spotify account, for the volume of the device Spotify plays on elsewhere. */
export function SpotifySettings() {
	const t = useT();
	const status = useProvider<SpotifyStatus>("spotify");
	const [busy, setBusy] = useState<"connect" | "other" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [clientId, setClientId] = useState("");

	const run = async (action: string, payload?: unknown, kind: "connect" | "other" = "other") => {
		setBusy(kind);
		setError(null);
		try {
			await providerAction(MUSIC_PROVIDER, action, payload);
			return true;
		} catch (e) {
			const code = String(e);
			if (code !== "cancelled") setError(errorText(t, code));
			return false;
		} finally {
			setBusy(null);
		}
	};

	const saveClient = async (e: FormEvent) => {
		e.preventDefault();
		if (await run("spotifySetClient", { id: clientId })) setClientId("");
	};

	const revoked = status?.error === "unauthorized";
	const description =
		busy === "connect"
			? t("music.spotify.waiting")
			: !status?.hasClient
				? t("music.spotify.noClient")
				: revoked
					? t("music.spotify.revoked")
					: status.connected
						? status.error
							? errorText(t, status.error)
							: t("music.spotify.connected")
						: t("music.spotify.none");

	return (
		<Block>
			<Row
				label={t("music.spotify.title")}
				desc={description}
				descTone={revoked || (status?.connected && status.error) ? "warn" : undefined}
			>
				{busy === "connect" ? (
					<Button onClick={() => providerAction(MUSIC_PROVIDER, "spotifyCancel")}>{t("music.spotify.cancel")}</Button>
				) : status?.connected && !revoked ? (
					<Button variant="danger" disabled={!!busy} onClick={() => run("spotifyDisconnect")}>
						{t("music.spotify.disconnect")}
					</Button>
				) : (
					status?.hasClient && (
						<Button variant="primary" disabled={!!busy} onClick={() => run("spotifyConnect", undefined, "connect")}>
							{t("music.spotify.connect")}
						</Button>
					)
				)}
			</Row>

			{status && !status.hasClient && (
				<>
					<Desc>
						{t("music.spotify.clientHow", { redirect: REDIRECT })}{" "}
						<LinkButton onClick={() => command("open_external", { url: DASHBOARD_URL })}>
							{t("music.spotify.clientOpen")}
						</LinkButton>
					</Desc>
					<form className="flex gap-2" onSubmit={saveClient}>
						<Input
							className="flex-1"
							value={clientId}
							placeholder={t("music.spotify.clientId")}
							spellCheck={false}
							onChange={(e) => setClientId(e.target.value)}
						/>
						<Button variant="primary" disabled={!!busy || !clientId.trim()}>
							{t("music.spotify.clientSave")}
						</Button>
					</form>
				</>
			)}
			{status?.hasClient && !status.connected && (
				<Desc>
					<LinkButton disabled={!!busy} onClick={() => run("spotifyClearClient")}>
						{t("music.spotify.clientRemove")}
					</LinkButton>
				</Desc>
			)}
			{error && <Desc tone="error">{error}</Desc>}
		</Block>
	);
}

import { useState, type FormEvent } from "react";
import { command, providerAction, useProvider } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { MUSIC_PROVIDER } from "../hooks/useMusic";

const DASHBOARD_URL = "https://developer.spotify.com/dashboard";
/** Must match `REDIRECT` in `src-tauri/src/providers/music/spotify.rs`. */
const REDIRECT = "http://127.0.0.1:43821/callback";
const ERRORS = ["premium", "noDevice", "unauthorized", "network", "http", "rateLimited", "invalid", "timeout", "denied", "portBusy", "noClient"];

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
  const description = busy === "connect"
    ? t("music.spotify.waiting")
    : !status?.hasClient
      ? t("music.spotify.noClient")
      : revoked
        ? t("music.spotify.revoked")
        : status.connected
          ? status.error ? errorText(t, status.error) : t("music.spotify.connected")
          : t("music.spotify.none");

  return (
    <div className="settings-block">
      <div className="settings-row">
        <div className="settings-text">
          <span className="settings-label">{t("music.spotify.title")}</span>
          <span className={`settings-desc ${revoked || (status?.connected && status.error) ? "cal-warn" : ""}`}>
            {description}
          </span>
        </div>
        {busy === "connect" ? (
          <button className="settings-btn" onClick={() => providerAction(MUSIC_PROVIDER, "spotifyCancel")}>
            {t("music.spotify.cancel")}
          </button>
        ) : status?.connected && !revoked ? (
          <button className="settings-btn danger" disabled={!!busy} onClick={() => run("spotifyDisconnect")}>
            {t("music.spotify.disconnect")}
          </button>
        ) : (
          status?.hasClient && (
            <button className="settings-btn primary" disabled={!!busy} onClick={() => run("spotifyConnect", undefined, "connect")}>
              {t("music.spotify.connect")}
            </button>
          )
        )}
      </div>

      {status && !status.hasClient && (
        <>
          <span className="settings-desc">
            {t("music.spotify.clientHow", { redirect: REDIRECT })}{" "}
            <button className="cal-link" onClick={() => command("open_external", { url: DASHBOARD_URL })}>
              {t("music.spotify.clientOpen")}
            </button>
          </span>
          <form className="cal-form" onSubmit={saveClient}>
            <input
              className="settings-input"
              value={clientId}
              placeholder={t("music.spotify.clientId")}
              spellCheck={false}
              onChange={(e) => setClientId(e.target.value)}
            />
            <button className="settings-btn primary" disabled={!!busy || !clientId.trim()}>
              {t("music.spotify.clientSave")}
            </button>
          </form>
        </>
      )}
      {status?.hasClient && !status.connected && (
        <span className="settings-desc">
          <button className="cal-link" disabled={!!busy} onClick={() => run("spotifyClearClient")}>
            {t("music.spotify.clientRemove")}
          </button>
        </span>
      )}
      {error && <span className="settings-error">{error}</span>}
    </div>
  );
}

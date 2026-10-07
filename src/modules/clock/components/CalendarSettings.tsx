import { useState, type FormEvent } from "react";
import { CloseIcon } from "../../../components/icons";
import { command, providerAction, useProvider } from "../../../core/bridge";
import { useT } from "../../../core/i18n";
import { setSetting, useSetting } from "../../../core/settings";
import { Toggle } from "../../../settings/components/Toggle";
import { calendarSettings, calendarVisibility, remindMinutes } from "../settings";
import { CALENDAR_PROVIDER, type CalendarState } from "../types";

const CLOUD_CONSOLE_URL = "https://console.cloud.google.com/apis/credentials";
const LEAD_OPTIONS = [0, 1, 5, 10, 15, 30];

const errorText = (t: ReturnType<typeof useT>, code: string) =>
  ["unauthorized", "notFound", "invalid", "network", "http", "noClient", "denied", "timeout", "duplicate", "tooMany"].includes(code)
    ? t(`calendar.error.${code}` as Parameters<typeof t>[0])
    : code;

/** Reminder lead time, Google account, iCal links and which calendars show. */
export function CalendarSettings() {
  return (
    <>
      <Reminder />
      <div className="cal-divider" />
      <GoogleAccount />
      <div className="cal-divider" />
      <IcalLinks />
      <Calendars />
    </>
  );
}

function Reminder() {
  const t = useT();
  const remind = useSetting(calendarSettings.remind);
  const minutes = useSetting(remindMinutes);
  return (
    <label className={`settings-row ${remind ? "" : "is-disabled"}`}>
      <div className="settings-text">
        <span className="settings-label">{t("calendar.remindMinutes.label")}</span>
        <span className="settings-desc">{t("calendar.remindMinutes.desc")}</span>
      </div>
      <select
        className="settings-select"
        value={minutes}
        disabled={!remind}
        onChange={(e) => setSetting(remindMinutes, Number(e.target.value))}
      >
        {LEAD_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n === 0 ? t("calendar.remindMinutes.atStart") : t("calendar.remindMinutes.before", { n })}
          </option>
        ))}
      </select>
    </label>
  );
}

function GoogleAccount() {
  const t = useT();
  const google = useProvider<CalendarState>(CALENDAR_PROVIDER)?.google;
  const [busy, setBusy] = useState<"connect" | "other" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const run = async (action: string, payload?: unknown, kind: "connect" | "other" = "other") => {
    setBusy(kind);
    setError(null);
    try {
      await providerAction(CALENDAR_PROVIDER, action, payload);
      return true;
    } catch (e) {
      const code = String(e);
      if (code !== "cancelled") setError(errorText(t, code));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const status = !google?.hasClient
    ? t("calendar.google.noClient")
    : google.error === "unauthorized"
      ? t("calendar.google.revoked")
      : google.connected
        ? t("calendar.google.connected", { account: google.account ?? "…" })
        : t("calendar.google.none");

  const saveClient = async (e: FormEvent) => {
    e.preventDefault();
    if (await run("setClient", { id: clientId, secret: clientSecret })) {
      setClientId("");
      setClientSecret("");
    }
  };

  return (
    <div className="settings-block">
      <div className="settings-row">
        <div className="settings-text">
          <span className="settings-label">{t("calendar.google.title")}</span>
          <span className={`settings-desc ${google?.error === "unauthorized" ? "cal-warn" : ""}`}>
            {busy === "connect" ? t("calendar.google.waiting") : status}
          </span>
        </div>
        {busy === "connect" ? (
          <button className="settings-btn" onClick={() => providerAction(CALENDAR_PROVIDER, "cancelConnect")}>
            {t("calendar.google.cancel")}
          </button>
        ) : google?.connected && google.error !== "unauthorized" ? (
          <button className="settings-btn danger" disabled={!!busy} onClick={() => run("disconnectGoogle")}>
            {t("calendar.google.disconnect")}
          </button>
        ) : (
          google?.hasClient && (
            <button className="settings-btn primary" disabled={!!busy} onClick={() => run("connectGoogle", undefined, "connect")}>
              {t("calendar.google.connect")}
            </button>
          )
        )}
      </div>

      {google && !google.hasClient && (
        <>
          <span className="settings-desc">
            {t("calendar.google.clientHow")}{" "}
            <button className="cal-link" onClick={() => command("open_external", { url: CLOUD_CONSOLE_URL })}>
              {t("calendar.google.clientOpen")}
            </button>
          </span>
          <form className="cal-form" onSubmit={saveClient}>
            <input
              className="settings-input"
              value={clientId}
              placeholder={t("calendar.google.clientId")}
              spellCheck={false}
              onChange={(e) => setClientId(e.target.value)}
            />
            <input
              className="settings-input"
              type="password"
              value={clientSecret}
              placeholder={t("calendar.google.clientSecret")}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setClientSecret(e.target.value)}
            />
            <button className="settings-btn primary" disabled={!!busy || !clientId.trim()}>
              {t("calendar.google.clientSave")}
            </button>
          </form>
        </>
      )}
      {google?.hasClient && !google.builtinClient && !google.connected && (
        <span className="settings-desc">
          <button className="cal-link" disabled={!!busy} onClick={() => run("clearClient")}>
            {t("calendar.google.clientRemove")}
          </button>
        </span>
      )}
      {error && <span className="settings-error">{error}</span>}
    </div>
  );
}

function IcalLinks() {
  const t = useT();
  const state = useProvider<CalendarState>(CALENDAR_PROVIDER);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await providerAction(CALENDAR_PROVIDER, "addFeed", { url });
      setUrl("");
    } catch (err) {
      setError(errorText(t, String(err)));
    } finally {
      setBusy(false);
    }
  };

  const feeds = state?.feeds ?? [];
  return (
    <div className="settings-block">
      <div className="settings-text">
        <span className="settings-label">{t("calendar.ics.title")}</span>
        <span className="settings-desc">{t("calendar.ics.desc")}</span>
      </div>
      <form className="cal-form" onSubmit={add}>
        <input
          className="settings-input"
          type="password"
          value={url}
          placeholder={t("calendar.ics.placeholder")}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
        />
        <button className="settings-btn primary" disabled={busy || !url.trim()}>
          {busy ? "…" : t("calendar.ics.add")}
        </button>
      </form>
      {error && <span className="settings-error">{error}</span>}
      {feeds.length > 0 && (
        <ul className="cal-list">
          {feeds.map((f) => (
            <li key={f.id} className="cal-item">
              <span className="cal-item-name">{f.name ?? f.host}</span>
              <span className={`cal-item-meta ${f.error ? "is-error" : ""}`}>
                {f.error ? errorText(t, f.error) : f.name ? f.host : ""}
              </span>
              <button
                className="cal-remove"
                title={t("calendar.ics.remove")}
                onClick={() => providerAction(CALENDAR_PROVIDER, "removeFeed", { id: f.id })}
              >
                <CloseIcon size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Calendars() {
  const t = useT();
  const calendars = useProvider<CalendarState>(CALENDAR_PROVIDER)?.calendars ?? [];
  const visibility = useSetting(calendarVisibility);
  if (!calendars.length) return null;

  return (
    <>
      <div className="cal-divider" />
      <div className="settings-block">
        <div className="settings-text">
          <span className="settings-label">{t("calendar.calendars.title")}</span>
          <span className="settings-desc">{t("calendar.calendars.desc")}</span>
        </div>
        <ul className="cal-list">
          {calendars.map((c) => (
            <li key={c.key} className="cal-item">
              <i className="cal-swatch" style={{ background: c.color }} />
              <span className="cal-item-name">{c.name}</span>
              <span className={`cal-item-meta ${c.error ? "is-error" : ""}`}>
                {c.error ? errorText(t, c.error) : c.source === "google" ? "Google" : "iCal"}
              </span>
              <Toggle
                checked={c.visible}
                onChange={(v) => {
                  const next = { ...visibility, [c.key]: v };
                  // Back to the calendar's own default: forget the override.
                  if (v === c.defaultVisible) delete next[c.key];
                  setSetting(calendarVisibility, next);
                }}
              />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

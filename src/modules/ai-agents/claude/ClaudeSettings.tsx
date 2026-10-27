import { useState } from "react";
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
    <div className="settings-block">
      <div className="settings-row">
        <div className="settings-text">
          <span className="settings-label">{t("claude.integration.title")}</span>
          <span className="settings-desc">{t("claude.integration.desc", { file: "~/.claude/settings.json" })}</span>
        </div>
        {outdated && (
          <button className="settings-btn primary" disabled={busy} onClick={() => run("install")}>
            {busy ? "…" : t("claude.setup.update")}
          </button>
        )}
        <button
          className={`settings-btn ${installed ? "danger" : "primary"}`}
          disabled={busy || !state}
          onClick={() => run(installed ? "uninstall" : "install")}
        >
          {busy ? "…" : installed ? t("claude.integration.remove") : t("claude.integration.enable")}
        </button>
      </div>
      <div className="settings-chips">
        <Chip ok={!!i?.hooks} label="Hooks" />
        <Chip ok={!!i?.statusline} label="Statusline" />
        <Chip ok={!!i?.permissions} label={t("claude.integration.permissions")} />
        <Chip ok={!!i?.serverOk} label={t("claude.integration.server")} />
      </div>
      {installed && (
        <span className="settings-desc">
          {t("claude.integration.restart")}
        </span>
      )}
      {error && <span className="settings-error">{error}</span>}
    </div>
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
    <div className="settings-row is-static">
      <div className="settings-text">
        <span className="settings-label">{t(defs.enabled.label)}</span>
        <span className="settings-desc" title={file ?? undefined}>
          {name}
          {" · "}
          <button className="claude-sound-link" onClick={() => providerAction("claude", "testSound", kind)}>
            {t("claude.sound.test")}
          </button>
          {" · "}
          <button className="claude-sound-link" onClick={pick}>
            {t("claude.sound.choose")}
          </button>
          {file && (
            <>
              {" · "}
              <button className="claude-sound-link" onClick={() => setSetting(defs.file, null)}>
                {t("claude.sound.reset")}
              </button>
            </>
          )}
        </span>
      </div>
      <Toggle checked={enabled} onChange={(v) => setSetting(defs.enabled, v)} />
    </div>
  );
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`settings-chip ${ok ? "ok" : ""}`}>{label}</span>;
}

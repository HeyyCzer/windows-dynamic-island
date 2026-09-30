import { useState } from "react";
import { providerAction, useProvider } from "../../../core/bridge";

interface IntegrationState {
  integration: { hooks: boolean; statusline: boolean; serverOk: boolean };
}

/** Claude Code integration status + install/remove, for the settings window. */
export function ClaudeSettings() {
  const state = useProvider<IntegrationState>("claude");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const i = state?.integration;
  const installed = !!i?.hooks && !!i?.statusline;

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
          <span className="settings-label">Integração com Claude Code</span>
          <span className="settings-desc">
            Hooks HTTP para status em tempo real + statusline para limites do plano. Seu statusline atual continua
            funcionando. Um backup do <code>~/.claude/settings.json</code> é criado a cada alteração.
          </span>
        </div>
        <button
          className={`settings-btn ${installed ? "danger" : "primary"}`}
          disabled={busy || !state}
          onClick={() => run(installed ? "uninstall" : "install")}
        >
          {busy ? "…" : installed ? "Remover" : "Ativar"}
        </button>
      </div>
      <div className="settings-chips">
        <Chip ok={!!i?.hooks} label="Hooks" />
        <Chip ok={!!i?.statusline} label="Statusline" />
        <Chip ok={!!i?.serverOk} label="Servidor local :47823" />
      </div>
      {installed && (
        <span className="settings-desc">
          Sessões do Claude Code já abertas precisam ser reiniciadas para carregar os hooks.
        </span>
      )}
      {error && <span className="settings-error">{error}</span>}
    </div>
  );
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`settings-chip ${ok ? "ok" : ""}`}>{label}</span>;
}

import { providerAction, useProvider } from "../../../core/bridge";
import type { AgentSnapshot, AgentStatus, UsageLimit } from "../common/types";

/** Mirrors `ClaudeState` in `src-tauri/src/providers/claude/mod.rs`. */
interface ClaudeState {
  sessions: {
    id: string;
    project: string;
    cwd: string;
    status: AgentStatus;
    activity: string | null;
    tool: string | null;
    turnStartedAt: number | null;
    finishedAt: number | null;
    lastEventAt: number;
    model: string | null;
    contextPct: number | null;
    source: "hooks" | "transcript";
  }[];
  limits: {
    fiveHour: { usedPct: number; resetsAt: number | null } | null;
    sevenDay: { usedPct: number; resetsAt: number | null } | null;
    updatedAt: number;
  } | null;
  model: string | null;
  tokensToday: { input: number; output: number; cacheRead: number; cacheWrite: number; messages: number };
  integration: { hooks: boolean; statusline: boolean; serverOk: boolean };
}

const PROVIDER = "claude";

export function useClaude(): AgentSnapshot {
  const state = useProvider<ClaudeState>(PROVIDER);
  if (!state) return { available: false, sessions: [], limits: [] };

  const limits: UsageLimit[] = [];
  const { fiveHour, sevenDay } = state.limits ?? {};
  if (fiveHour) limits.push({ id: "5h", label: "Sessão · 5h", usedPct: fiveHour.usedPct, resetsAt: toMs(fiveHour.resetsAt) });
  if (sevenDay) limits.push({ id: "7d", label: "Semana · 7d", usedPct: sevenDay.usedPct, resetsAt: toMs(sevenDay.resetsAt) });

  const { hooks, statusline, serverOk } = state.integration;
  const installed = hooks && statusline;

  return {
    available: true,
    model: state.model,
    tokensToday: state.tokensToday,
    limits,
    limitsHint: installed
      ? "Limites aparecem na próxima resposta do Claude Code"
      : "Ative a integração para ver os limites do plano",
    sessions: state.sessions.map((s) => ({
      id: s.id,
      title: s.project,
      status: s.status,
      activity: s.activity,
      turnStartedAt: s.turnStartedAt,
      finishedAt: s.finishedAt,
      lastEventAt: s.lastEventAt,
      model: s.model,
      contextPct: s.contextPct,
    })),
    setup: installed
      ? undefined
      : {
          message: serverOk
            ? "Status em tempo real e limites do plano via hooks do Claude Code (backup do settings.json é criado)."
            : "Servidor local indisponível (porta 47823 ocupada?).",
          actionLabel: "Ativar integração",
          action: () => providerAction(PROVIDER, "install"),
        },
  };
}

const toMs = (unixSeconds: number | null) => (unixSeconds ? unixSeconds * 1000 : null);

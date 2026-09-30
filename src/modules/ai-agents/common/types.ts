import type { ComponentType, ReactNode } from "react";

/**
 * Contract every AI agent integration implements (Claude today; Codex,
 * Gemini, … tomorrow). The AI Agents module only talks to this interface.
 */
export interface AgentDefinition {
  id: string;
  name: string;
  /** Brand-ish accent used for icons, bars and highlights. */
  color: string;
  Icon: (props: { size: number; state?: AgentStatus }) => ReactNode;
  /** React hook returning the agent's live snapshot. */
  useAgent: () => AgentSnapshot;
  /** Agent-specific block in the settings window (integration setup…). */
  SettingsSection?: ComponentType;
}

export type AgentStatus = "idle" | "working" | "waiting" | "done";

export interface AgentSession {
  id: string;
  /** Usually the project folder name. */
  title: string;
  status: AgentStatus;
  /** What it's doing right now, already translated ("Editing App.tsx"). */
  activity?: string | null;
  /** Unix ms — start of the current/last turn, drives the live timer. */
  turnStartedAt?: number | null;
  finishedAt?: number | null;
  lastEventAt: number;
  model?: string | null;
  contextPct?: number | null;
}

export interface UsageLimit {
  id: string;
  label: string;
  usedPct: number;
  /** Unix ms. */
  resetsAt?: number | null;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  messages: number;
}

export interface AgentSnapshot {
  available: boolean;
  sessions: AgentSession[];
  limits: UsageLimit[];
  /** Shown when `limits` is empty. */
  limitsHint?: string;
  tokensToday?: TokenUsage;
  model?: string | null;
  /** Call-to-action when the integration needs to be set up. */
  setup?: {
    message: string;
    actionLabel: string;
    action: () => Promise<unknown>;
  };
}

/** A session together with the agent it belongs to. */
export interface AgentSessionRef {
  agent: AgentDefinition;
  session: AgentSession;
}

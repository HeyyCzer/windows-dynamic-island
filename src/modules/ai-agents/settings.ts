import type { SettingDef } from "../../core/settings";

export const agentSettings = {
  peekOnWaiting: {
    key: "agents.peekOnWaiting",
    label: "Expandir quando um agente pedir sua atenção",
    description: "Pedido de permissão ou pergunta aguardando resposta.",
    default: true,
  },
  peekOnDone: {
    key: "agents.peekOnDone",
    label: "Expandir quando um agente terminar",
    default: false,
  },
} satisfies Record<string, SettingDef>;

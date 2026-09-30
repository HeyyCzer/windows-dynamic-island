import type { SettingDef } from "../../core/settings";

export const agentSettings = {
  peekOnWaiting: {
    key: "agents.peekOnWaiting.label",
    label: "agents.peekOnWaiting.label",
    description: "agents.peekOnWaiting.desc",
    default: true,
  },
  peekOnDone: {
    key: "agents.peekOnDone.label",
    label: "agents.peekOnDone.label",
    default: false,
  },
} satisfies Record<string, SettingDef>;

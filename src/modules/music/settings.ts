import type { SettingDef } from "../../core/settings";

export const musicSettings = {
  autoExpand: {
    key: "music.autoExpand",
    label: "Expandir ao trocar de música",
    description: "Mostra a capa e o título por alguns segundos quando uma nova faixa começa.",
    default: false,
  },
  visualizer: {
    key: "music.visualizer",
    label: "Visualizador de áudio",
    description: "Barras animadas no ritmo da música.",
    default: true,
  },
} satisfies Record<string, SettingDef>;

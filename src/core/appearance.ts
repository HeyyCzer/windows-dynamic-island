/**
 * Island look: the visual style (`dynamic` / `windows`) and, in the Windows
 * Island style, the colored rim around the black island.
 */
import { appearanceSettings, readSetting, useSettings, type IslandStyle } from "./settings";
import type { MessageKey } from "./i18n";

export interface BorderPreset {
  id: string;
  name: MessageKey;
  colors: string[];
}

/** "none" is the classic, barely-there hairline. */
export const BORDER_PRESETS: BorderPreset[] = [
  { id: "none", name: "appearance.preset.none", colors: [] },
  { id: "intelligence", name: "appearance.preset.intelligence", colors: ["#0894FF", "#C959DD", "#FF2E54", "#FF9004"] },
  { id: "aurora", name: "appearance.preset.aurora", colors: ["#7F5AF0", "#2CB1FF", "#2CFF9E"] },
  { id: "sunset", name: "appearance.preset.sunset", colors: ["#FF5F6D", "#FFC371"] },
  { id: "ocean", name: "appearance.preset.ocean", colors: ["#00C6FF", "#0072FF"] },
  { id: "claude", name: "appearance.preset.claude", colors: ["#D97757", "#F2B880"] },
  { id: "neon", name: "appearance.preset.neon", colors: ["#FF00CC", "#3333FF"] },
  { id: "mono", name: "appearance.preset.mono", colors: ["#FFFFFF", "#6E6E73"] },
];

/** Colors offered for the custom two-color gradient. */
export const PALETTE = [
  "#FF453A", "#FF9F0A", "#FFD60A", "#30D158", "#64D2FF",
  "#0A84FF", "#5E5CE6", "#BF5AF2", "#FF375F", "#FFFFFF",
];

export const THICKNESSES = [1, 2, 3] as const;

export interface Appearance {
  style: IslandStyle;
  /** Gradient stops; empty = classic hairline. */
  rim: string[];
  thickness: number;
  animate: boolean;
  glow: boolean;
  idleClock: boolean;
}

export function borderColors(border: string, custom: string[]): string[] {
  if (border === "custom") return custom.length >= 2 ? custom.slice(0, 2) : ["#BF5AF2", "#64D2FF"];
  return BORDER_PRESETS.find((p) => p.id === border)?.colors ?? [];
}

export function useAppearance(): Appearance {
  const s = useSettings();
  const style = readSetting(s, appearanceSettings.style) === "windows" ? "windows" : "dynamic";
  return {
    style,
    rim: borderColors(readSetting(s, appearanceSettings.border), readSetting(s, appearanceSettings.customColors)),
    thickness: Math.min(3, Math.max(1, Number(readSetting(s, appearanceSettings.thickness)) || 2)),
    animate: readSetting(s, appearanceSettings.animate),
    glow: readSetting(s, appearanceSettings.glow),
    idleClock: readSetting(s, appearanceSettings.idleClock),
  };
}

/** CSS for the rim: a conic gradient (first color repeated, so it can spin seamlessly). */
export function rimBackground(colors: string[]) {
  if (!colors.length) return undefined;
  const stops = colors.length === 1 ? [colors[0], colors[0]] : [...colors, colors[0]];
  return `conic-gradient(from var(--rim-angle), ${stops.join(", ")})`;
}

/** Swatch fill for a preset in the settings. */
export function swatchBackground(colors: string[]) {
  if (!colors.length) return "#000";
  if (colors.length === 1) return colors[0];
  return `linear-gradient(135deg, ${colors.join(", ")})`;
}

/**
 * Named icons for activities sent through the local API (and the system
 * alerts), drawn with Windows' own icon font (Segoe Fluent Icons, or Segoe
 * MDL2 Assets on Windows 10). Same names as Windows Island's API.
 */
import type { CSSProperties } from "react";

const GLYPHS: Record<string, number> = {
  bell: 0xea8f,
  music: 0xe8d6,
  volume: 0xe767,
  mute: 0xe74f,
  battery: 0xe83f,
  charging: 0xe945,
  mail: 0xe715,
  chat: 0xe8bd,
  call: 0xe717,
  download: 0xe896,
  upload: 0xe898,
  timer: 0xe916,
  clock: 0xe823,
  calendar: 0xe787,
  check: 0xe73e,
  error: 0xe783,
  warning: 0xe7ba,
  info: 0xe946,
  code: 0xe943,
  sync: 0xe895,
  heart: 0xeb51,
  star: 0xe734,
  mic: 0xe720,
  camera: 0xe722,
  location: 0xe707,
  wifi: 0xe701,
  bluetooth: 0xe702,
  headphones: 0xe7f6,
  folder: 0xe8b7,
  play: 0xe768,
  pause: 0xe769,
  next: 0xe893,
  previous: 0xe892,
  clipboard: 0xe77f,
  copy: 0xe8c8,
  pulse: 0xe9d9,
  text: 0xe8d2,
  open: 0xe8a7,
  search: 0xe721,
  "chevron-up": 0xe70e,
  "chevron-down": 0xe70d,
  refresh: 0xe72c,
  // Not in the icon font: falls back to Segoe UI Symbol.
  claude: 0x273b,
};

export const GLYPH_NAMES = Object.keys(GLYPHS);

/** A known name, a single character, or the bell. */
export function resolveGlyph(name: string | null | undefined): string {
  const key = name?.trim().toLowerCase() ?? "";
  if (key in GLYPHS) return String.fromCodePoint(GLYPHS[key]);
  if (name && [...name.trim()].length === 1) return name.trim();
  return String.fromCodePoint(GLYPHS.bell);
}

export function Glyph({ name, size = 14, color, style }: { name?: string | null; size?: number; color?: string; style?: CSSProperties }) {
  return (
    <i className="glyph" aria-hidden style={{ fontSize: size, color, ...style }}>
      {resolveGlyph(name)}
    </i>
  );
}

/**
 * Round (or rounded) badge: a picture when there is one (app logo), else the
 * icon in the accent color over a tint of it.
 */
export function Badge({
  icon,
  image,
  color = "#ffffff",
  size,
  radius = size / 2,
  glyphSize = size * 0.48,
}: {
  icon?: string | null;
  image?: string | null;
  color?: string;
  size: number;
  radius?: number;
  glyphSize?: number;
}) {
  return (
    <span
      className="badge"
      style={{
        width: size,
        height: size,
        borderRadius: image ? Math.min(radius, size * 0.25) : radius,
        background: image ? `center / cover no-repeat url("${image}")` : `color-mix(in srgb, ${color} 22%, transparent)`,
      }}
    >
      {!image && <Glyph name={icon} size={glyphSize} color={color} />}
    </span>
  );
}

import { useEffect, useRef, useState } from "react";
import { providerAction, useProvider } from "../../../core/bridge";

/** Mirrors `MusicState` in `src-tauri/src/providers/music/mod.rs`. */
export interface MusicState {
  available: boolean;
  playing: boolean;
  title: string;
  artist: string;
  album: string;
  appId: string;
  appName: string;
  positionMs: number;
  positionAt: number;
  durationMs: number;
  thumbnail: string | null;
  canNext: boolean;
  canPrevious: boolean;
  /** The YouTube video a browser is playing, once identified. */
  youtubeId: string | null;
}

export const MUSIC_PROVIDER = "music";
export const LEVEL_EVENT = "music://level";

/** How long a paused track keeps its spot in the compact island. */
const PAUSE_GRACE_MS = 15_000;

/** `focus` brings the player's window to the front. */
export const musicAction = (action: "toggle" | "next" | "previous" | "seek" | "focus", payload?: number) =>
  providerAction(MUSIC_PROVIDER, action, payload);

export function useMusic() {
  const music = useProvider<MusicState>(MUSIC_PROVIDER);
  const lastPlayingAt = useRef(0);
  const [, force] = useState(0);

  if (music?.playing) lastPlayingAt.current = Date.now();

  // Re-render when the pause grace period runs out.
  useEffect(() => {
    if (!music?.available || music.playing) return;
    const left = PAUSE_GRACE_MS - (Date.now() - lastPlayingAt.current);
    if (left <= 0) return;
    const t = window.setTimeout(() => force((n) => n + 1), left + 50);
    return () => window.clearTimeout(t);
  }, [music?.available, music?.playing]);

  const recentlyPlayed = Date.now() - lastPlayingAt.current < PAUSE_GRACE_MS;
  const active = !!music?.available && (music.playing || recentlyPlayed);
  return { music, active };
}

/** Current playback position, extrapolated between backend updates. */
export function useLivePosition(music: MusicState | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!music?.playing) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [music?.playing]);

  if (!music) return 0;
  const elapsed = music.playing ? Math.max(0, now - music.positionAt) : 0;
  const pos = music.positionMs + elapsed;
  return music.durationMs ? Math.min(pos, music.durationMs) : pos;
}

export function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m % 60).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

import { useEffect, useRef, useState } from "react";
import { providerAction, useProvider } from "../../core/bridge";

/** Mirrors `MediaState` in `src-tauri/src/providers/media.rs`. */
export interface MediaState {
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
}

/** How long a paused track keeps its spot in the compact island. */
const PAUSE_GRACE_MS = 15_000;

export const mediaAction = (action: "toggle" | "next" | "previous" | "seek", payload?: number) =>
  providerAction("media", action, payload);

export function useMedia() {
  const media = useProvider<MediaState>("media");
  const lastPlayingAt = useRef(0);
  const [, force] = useState(0);

  if (media?.playing) lastPlayingAt.current = Date.now();

  // Re-render when the pause grace period runs out.
  useEffect(() => {
    if (!media?.available || media.playing) return;
    const left = PAUSE_GRACE_MS - (Date.now() - lastPlayingAt.current);
    if (left <= 0) return;
    const t = window.setTimeout(() => force((n) => n + 1), left + 50);
    return () => window.clearTimeout(t);
  }, [media?.available, media?.playing]);

  const recentlyPlayed = Date.now() - lastPlayingAt.current < PAUSE_GRACE_MS;
  const active = !!media?.available && (media.playing || recentlyPlayed);
  return { media, active };
}

/** Current playback position, extrapolated between backend updates. */
export function useLivePosition(media: MediaState | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!media?.playing) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [media?.playing]);

  if (!media) return 0;
  const elapsed = media.playing ? Math.max(0, now - media.positionAt) : 0;
  const pos = media.positionMs + elapsed;
  return media.durationMs ? Math.min(pos, media.durationMs) : pos;
}

export function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m % 60).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

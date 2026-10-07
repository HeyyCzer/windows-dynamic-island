import { useEffect, useMemo, useRef } from "react";
import { createStore } from "../../../core/island";

/** Videos whose owner disabled embedding (or that failed): back to the artwork. */
export const unembeddable = createStore<string[]>([]);

/** More drift than this (s) from the browser's position triggers a seek. */
const MAX_DRIFT = 1.5;
/** YouTube player errors meaning "can't play here". */
const FATAL_ERRORS = new Set([2, 5, 100, 101, 150, 153]);

/**
 * A muted YouTube player mirroring the video the browser plays: same video,
 * kept in sync with the browser tab's position and play/pause (the sound
 * keeps coming from the browser). Talks to the embed through its postMessage
 * API, so no script has to be loaded into the page.
 */
export function YouTubeMirror({
  videoId,
  positionMs,
  playing,
  className,
}: {
  videoId: string;
  positionMs: number;
  playing: boolean;
  className?: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const time = useRef(-1);
  const state = useRef(-1);
  const live = useRef({ positionMs, playing });
  live.current = { positionMs, playing };

  // The start position only matters when a new video loads.
  const src = useMemo(() => {
    const start = Math.max(0, Math.floor(live.current.positionMs / 1000));
    const params = new URLSearchParams({
      enablejsapi: "1",
      mute: "1",
      autoplay: live.current.playing ? "1" : "0",
      controls: "0",
      disablekb: "1",
      fs: "0",
      playsinline: "1",
      rel: "0",
      iv_load_policy: "3",
      start: String(start),
      origin: window.location.origin,
    });
    return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;
  }, [videoId]);

  useEffect(() => {
    time.current = -1;
    state.current = -1;
    const post = (message: object) =>
      frame.current?.contentWindow?.postMessage(JSON.stringify(message), "https://www.youtube-nocookie.com");
    const command = (func: string, args: unknown[] = []) => post({ event: "command", func, args, id: 1, channel: "widget" });

    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data !== "string") return;
      let data: { event?: string; info?: unknown };
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      if (data.event === "onReady") command("mute");
      if (data.event === "infoDelivery" && data.info && typeof data.info === "object") {
        const info = data.info as { currentTime?: number; playerState?: number };
        if (typeof info.currentTime === "number") time.current = info.currentTime;
        if (typeof info.playerState === "number") state.current = info.playerState;
      }
      if (data.event === "onError" && FATAL_ERRORS.has(Number(data.info))) {
        unembeddable.set((list) => (list.includes(videoId) ? list : [...list, videoId]));
      }
    };
    window.addEventListener("message", onMessage);

    // Ask for state updates; then follow the browser about once a second.
    const tick = window.setInterval(() => {
      post({ event: "listening", id: 1, channel: "widget" });
      const { positionMs, playing } = live.current;
      if (time.current >= 0 && Math.abs(time.current - positionMs / 1000) > MAX_DRIFT) {
        command("seekTo", [positionMs / 1000, true]);
      }
      // YT.PlayerState: 1 = playing.
      if (playing && state.current !== 1) command("playVideo");
      if (!playing && state.current === 1) command("pauseVideo");
    }, 1000);

    return () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(tick);
    };
  }, [videoId]);

  return (
    <iframe
      ref={frame}
      key={videoId}
      className={`yt-mirror ${className ?? ""}`}
      src={src}
      title="YouTube"
      allow="autoplay; encrypted-media"
      referrerPolicy="strict-origin-when-cross-origin"
      tabIndex={-1}
    />
  );
}

/** The browser's YouTube video, unless it can't be embedded. */
export function useMirrorVideo(youtubeId: string | null | undefined) {
  const blocked = unembeddable.use();
  return youtubeId && !blocked.includes(youtubeId) ? youtubeId : null;
}

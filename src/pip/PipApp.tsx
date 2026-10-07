import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, type MouseEvent, type WheelEvent } from "react";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from "../components/icons";
import { Marquee } from "../components/Marquee";
import { command, isTauri } from "../core/bridge";
import { useT } from "../core/i18n";
import { useSyncLocale } from "../core/i18n";
import { Artwork } from "../modules/music/components/Artwork";
import { useMirrorVideo, YouTubeMirror } from "../modules/music/components/YouTubeMirror";
import { formatTime, musicAction, useLivePosition, useMusic } from "../modules/music/hooks/useMusic";
import { closePip, PIP_RETURN_EVENT } from "../modules/music/hooks/usePip";
import { isBrowserApp } from "./browsers";
import "./pip.css";

/** Closes itself once the browser's media has been gone this long. */
const MEDIA_LOST_MS = 5000;
/** A drag ends when the window stops moving for this long; then it snaps to edges. */
const SNAP_AFTER_MS = 220;

/**
 * The pinned video: a small always-on-top window with the browser's YouTube
 * video. Drag it anywhere (it snaps to edges and corners), scroll to resize,
 * hover for the controls.
 */
export function PipApp() {
  const t = useT();
  useSyncLocale();
  const { music } = useMusic();
  const position = useLivePosition(music);
  const video = useMirrorVideo(music?.youtubeId);
  const browser = !!music?.available && isBrowserApp(music.appName);

  // Close a few seconds after the browser tab (or the browser) went away.
  useEffect(() => {
    if (browser) return;
    const id = window.setTimeout(closePip, MEDIA_LOST_MS);
    return () => window.clearTimeout(id);
  }, [browser]);

  // Snap to the screen edges once a drag settles.
  const snapTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onMoved(() => {
        window.clearTimeout(snapTimer.current);
        snapTimer.current = window.setTimeout(() => command("pip_snap"), SNAP_AFTER_MS);
      })
      .then((fn) => (unlisten = fn));
    return () => unlisten?.();
  }, []);

  const startDrag = (e: MouseEvent) => {
    if (e.button !== 0 || (e.target as Element).closest("button, .pip-progress")) return;
    if (isTauri) getCurrentWindow().startDragging();
  };
  const onWheel = (e: WheelEvent) => command("pip_resize", { delta: -Math.sign(e.deltaY) * 32 });

  const progress = music?.durationMs ? position / music.durationMs : 0;

  return (
    <div className="pip" onMouseDown={startDrag} onWheel={onWheel}>
      {video ? (
        <YouTubeMirror videoId={video} positionMs={position} playing={!!music?.playing} className="pip-video" />
      ) : (
        // Ads and videos that refuse embedding: the artwork until a video is back.
        <div className="pip-art">
          <Artwork src={music?.thumbnail} size={96} radius={16} trackKey={music?.title} />
        </div>
      )}

      <div className="pip-overlay">
        <div className="pip-top">
          <Marquee text={music?.title ?? ""} className="pip-title" />
          <button
            className="pip-btn"
            title={t("music.backToIsland")}
            onClick={() => {
              emit(PIP_RETURN_EVENT);
              closePip();
            }}
          >
            ⤡
          </button>
          <button className="pip-btn" title={t("settings.close")} onClick={closePip}>
            ✕
          </button>
        </div>
        <div className="pip-bottom">
          <div className="pip-controls">
            <button className="pip-btn" onClick={() => musicAction("previous")}>
              <PrevIcon size={16} />
            </button>
            <button className="pip-btn pip-play" onClick={() => musicAction("toggle")}>
              {music?.playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
            </button>
            <button className="pip-btn" onClick={() => musicAction("next")}>
              <NextIcon size={16} />
            </button>
          </div>
          <div className="pip-timeline">
            <span>{formatTime(position)}</span>
            <div
              className="pip-progress"
              onClick={(e) => {
                if (!music?.durationMs) return;
                const r = e.currentTarget.getBoundingClientRect();
                musicAction("seek", Math.round(((e.clientX - r.left) / r.width) * music.durationMs));
              }}
            >
              <div className="pip-fill" style={{ transform: `scaleX(${Math.min(1, progress)})` }} />
            </div>
            <span>{music?.durationMs ? formatTime(music.durationMs) : "--:--"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

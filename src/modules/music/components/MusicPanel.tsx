import { motion } from "motion/react";
import { Marquee } from "../../../components/Marquee";
import { MusicIcon } from "../../../components/icons";
import { formatTime, musicAction, useLivePosition, type MusicState } from "../hooks/useMusic";
import { Artwork } from "./Artwork";
import { Controls } from "./Controls";
import { Visualizer } from "./Visualizer";
import { useT } from "../../../core/i18n";
import { closePip, openPip, usePipOpen } from "../hooks/usePip";
import { useMirrorVideo, YouTubeMirror } from "./YouTubeMirror";

/** Expanded now-playing panel. */
export function MusicPanel({
  music,
  accent,
  showVisualizer = true,
}: {
  music: MusicState | undefined;
  accent: string;
  showVisualizer?: boolean;
}) {
  const position = useLivePosition(music);
  const t = useT();
  const pinned = usePipOpen();
  const mirror = useMirrorVideo(music?.youtubeId);
  // While pinned, only the pinned window plays the video.
  const video = pinned ? null : mirror;

  if (!music?.available) {
    return (
      <div className="music-empty">
        <MusicIcon size={26} />
        <span>{t("music.nothingPlaying")}</span>
      </div>
    );
  }

  const progress = music.durationMs ? position / music.durationMs : 0;
  const subtitle = [music.artist, music.album].filter(Boolean).join(" — ") || music.appName;
  const openPlayer = (e: React.MouseEvent) => {
    e.stopPropagation();
    musicAction("focus");
  };

  return (
    <div className="music-panel" style={{ "--accent": accent } as React.CSSProperties}>
      {video ? (
        // YouTube in a browser: the video itself plays here (muted, in sync with the tab).
        <div className="music-video">
          <YouTubeMirror videoId={video} positionMs={position} playing={music.playing} />
          <button
            className="music-glass"
            onClick={(e) => {
              e.stopPropagation();
              openPip();
            }}
          >
            {t("music.pin")}
          </button>
        </div>
      ) : (
        <button className="music-open" title={music.appName} onClick={openPlayer}>
          <Artwork src={music.thumbnail} size={112} radius={20} trackKey={music.title} glow={accent} />
          {pinned && (
            <span
              className="music-glass music-unpin"
              title={t("music.unpin")}
              onClick={(e) => {
                e.stopPropagation();
                closePip();
              }}
            >
              {t("music.pinned")}
            </span>
          )}
        </button>
      )}

      <div className="music-info">
        <div className="music-head">
          <div className="music-titles">
            <button className="music-open music-open-title" title={music.appName} onClick={openPlayer}>
              <Marquee text={music.title} className="music-title" />
            </button>
            <Marquee text={subtitle} className="music-artist" />
          </div>
          {showVisualizer && <Visualizer playing={music.playing} color={accent} height={30} barWidth={4.5} />}
        </div>

        <div className="music-progress">
          <span className="time">{formatTime(position)}</span>
          <div
            className="bar"
            onClick={(e) => {
              if (!music.durationMs) return;
              const r = e.currentTarget.getBoundingClientRect();
              musicAction("seek", Math.round(((e.clientX - r.left) / r.width) * music.durationMs));
            }}
          >
            <motion.div
              className="bar-fill"
              initial={false}
              animate={{ scaleX: Math.min(1, progress) }}
              transition={{ type: "tween", ease: "linear", duration: 0.25 }}
            />
          </div>
          <span className="time">
            {music.durationMs ? `-${formatTime(music.durationMs - position)}` : "--:--"}
          </span>
        </div>

        <div className="music-footer">
          <button className="music-app music-open" onClick={openPlayer}>
            {music.appName}
          </button>
          <Controls music={music} />
          <span className="music-app ghost">{music.appName}</span>
        </div>
      </div>
    </div>
  );
}

import { motion } from "motion/react";
import { Marquee } from "../../../components/Marquee";
import { MusicIcon } from "../../../components/icons";
import { formatTime, musicAction, useLivePosition, type MusicState } from "../hooks/useMusic";
import { Artwork } from "./Artwork";
import { Controls } from "./Controls";
import { Visualizer } from "./Visualizer";

/** Expanded now-playing panel. */
export function MusicPanel({ music, accent }: { music: MusicState | undefined; accent: string }) {
  const position = useLivePosition(music);

  if (!music?.available) {
    return (
      <div className="music-empty">
        <MusicIcon size={26} />
        <span>Nada tocando</span>
      </div>
    );
  }

  const progress = music.durationMs ? position / music.durationMs : 0;
  const subtitle = [music.artist, music.album].filter(Boolean).join(" — ") || music.appName;

  return (
    <div className="music-panel" style={{ "--accent": accent } as React.CSSProperties}>
      <Artwork src={music.thumbnail} size={112} radius={20} trackKey={music.title} glow={accent} />

      <div className="music-info">
        <div className="music-head">
          <div className="music-titles">
            <Marquee text={music.title} className="music-title" />
            <Marquee text={subtitle} className="music-artist" />
          </div>
          <Visualizer playing={music.playing} color={accent} height={30} barWidth={4.5} />
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
          <span className="music-app">{music.appName}</span>
          <Controls music={music} />
          <span className="music-app ghost">{music.appName}</span>
        </div>
      </div>
    </div>
  );
}

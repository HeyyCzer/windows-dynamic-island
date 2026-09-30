import { AnimatePresence, motion } from "motion/react";
import { Marquee } from "../../../components/Marquee";
import { formatTime, useLivePosition, type MusicState } from "../hooks/useMusic";
import { Artwork } from "./Artwork";
import { Visualizer } from "./Visualizer";

/** Left slot of the compact pill: artwork + title over a dimmed artist line. */
export function MusicCompactLeft({ music }: { music: MusicState }) {
  return (
    <>
      <Artwork src={music.thumbnail} size={24} radius={7} trackKey={music.title} />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={`${music.title}|${music.artist}`}
          className="music-compact-titles"
          initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
          transition={{ duration: 0.25 }}
        >
          <Marquee text={music.title} className="music-compact-title" />
          {music.artist && <Marquee text={music.artist} className="music-compact-artist" />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

/** Right slot: live playback position + optional visualizer. */
export function MusicCompactRight({
  music,
  accent,
  showVisualizer,
}: {
  music: MusicState;
  accent: string;
  showVisualizer: boolean;
}) {
  const position = useLivePosition(music);
  return (
    <>
      <span className={`music-compact-time${music.playing ? "" : " is-paused"}`}>{formatTime(position)}</span>
      {showVisualizer && <Visualizer playing={music.playing} color={accent} />}
    </>
  );
}

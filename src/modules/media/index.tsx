import { AnimatePresence, motion } from "motion/react";
import type { IslandModule, ModuleView } from "../../core/types";
import { Marquee } from "../../components/Marquee";
import { MusicIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon } from "../../components/icons";
import { useAccentColor } from "./useAccentColor";
import { formatTime, mediaAction, useLivePosition, useMedia, type MediaState } from "./useMedia";
import { Visualizer } from "./Visualizer";

export const mediaModule: IslandModule = {
  id: "media",
  title: "Música",
  useView(): ModuleView {
    const { media, active } = useMedia();
    const accent = useAccentColor(media?.thumbnail);

    return {
      active,
      priority: media?.playing ? 50 : 10,
      icon: <Artwork src={media?.thumbnail} size={22} radius={11} />,
      compact: media && {
        left: <Artwork src={media.thumbnail} size={24} radius={7} trackKey={media.title} />,
        right: <Visualizer playing={media.playing} color={accent} />,
      },
      expanded: <MediaPanel media={media} accent={accent} />,
      expandedSize: { width: 560, height: 176 },
      activityKey: media?.playing ? `${media.title}|${media.artist}` : undefined,
    };
  },
};

function Artwork({
  src,
  size,
  radius,
  trackKey,
  glow,
}: {
  src: string | null | undefined;
  size: number;
  radius: number;
  trackKey?: string;
  glow?: string;
}) {
  return (
    <div
      className="artwork"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        boxShadow: glow ? `0 10px 40px -6px ${glow}88` : undefined,
      }}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={trackKey ?? src ?? "none"}
          className="artwork-img"
          initial={{ opacity: 0, scale: 1.25, filter: "blur(6px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.2, 0.9, 0.3, 1] }}
          style={src ? { backgroundImage: `url("${src}")` } : undefined}
        >
          {!src && <MusicIcon size={size * 0.5} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function MediaPanel({ media, accent }: { media: MediaState | undefined; accent: string }) {
  const position = useLivePosition(media);

  if (!media?.available) {
    return (
      <div className="media-empty">
        <MusicIcon size={26} />
        <span>Nada tocando</span>
      </div>
    );
  }

  const progress = media.durationMs ? position / media.durationMs : 0;

  return (
    <div className="media-panel" style={{ "--accent": accent } as React.CSSProperties}>
      <Artwork src={media.thumbnail} size={112} radius={20} trackKey={media.title} glow={accent} />

      <div className="media-info">
        <div className="media-head">
          <div className="media-titles">
            <Marquee text={media.title} className="media-title" />
            <Marquee text={[media.artist, media.album].filter(Boolean).join(" — ") || media.appName} className="media-artist" />
          </div>
          <Visualizer playing={media.playing} color={accent} height={20} barWidth={3} />
        </div>

        <div className="media-progress">
          <span className="time">{formatTime(position)}</span>
          <div
            className="bar"
            onClick={(e) => {
              if (!media.durationMs) return;
              const r = e.currentTarget.getBoundingClientRect();
              mediaAction("seek", Math.round(((e.clientX - r.left) / r.width) * media.durationMs));
            }}
          >
            <motion.div
              className="bar-fill"
              initial={false}
              animate={{ scaleX: Math.min(1, progress) }}
              transition={{ type: "tween", ease: "linear", duration: 0.25 }}
            />
          </div>
          <span className="time">{media.durationMs ? `-${formatTime(media.durationMs - position)}` : "--:--"}</span>
        </div>

        <div className="media-controls">
          <span className="media-app">{media.appName}</span>
          <div className="buttons">
            <CtrlButton disabled={!media.canPrevious} onClick={() => mediaAction("previous")}>
              <PrevIcon size={20} />
            </CtrlButton>
            <CtrlButton big onClick={() => mediaAction("toggle")}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={media.playing ? "pause" : "play"}
                  initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 0.4, opacity: 0, rotate: 30 }}
                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                  style={{ display: "grid" }}
                >
                  {media.playing ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
                </motion.span>
              </AnimatePresence>
            </CtrlButton>
            <CtrlButton disabled={!media.canNext} onClick={() => mediaAction("next")}>
              <NextIcon size={20} />
            </CtrlButton>
          </div>
          <span className="media-app ghost">{media.appName}</span>
        </div>
      </div>
    </div>
  );
}

function CtrlButton({
  children,
  onClick,
  disabled,
  big,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  big?: boolean;
}) {
  return (
    <motion.button
      className={`ctrl ${big ? "big" : ""}`}
      disabled={disabled}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.86 }}
      transition={{ type: "spring", stiffness: 600, damping: 22 }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </motion.button>
  );
}

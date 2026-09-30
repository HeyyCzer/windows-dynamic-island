import { AnimatePresence, motion } from "motion/react";
import { MusicIcon } from "../../../components/icons";

/** Album art that cross-fades (zoom + blur) whenever the track changes. */
export function Artwork({
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

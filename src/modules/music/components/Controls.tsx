import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from "../../../components/icons";
import { musicAction, type MusicState } from "../hooks/useMusic";

export function Controls({ music }: { music: MusicState }) {
  return (
    <div className="music-buttons">
      <CtrlButton disabled={!music.canPrevious} onClick={() => musicAction("previous")}>
        <PrevIcon size={20} />
      </CtrlButton>
      <CtrlButton big onClick={() => musicAction("toggle")}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={music.playing ? "pause" : "play"}
            initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.4, opacity: 0, rotate: 30 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            style={{ display: "grid" }}
          >
            {music.playing ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
          </motion.span>
        </AnimatePresence>
      </CtrlButton>
      <CtrlButton disabled={!music.canNext} onClick={() => musicAction("next")}>
        <NextIcon size={20} />
      </CtrlButton>
    </div>
  );
}

function CtrlButton({
  children,
  onClick,
  disabled,
  big,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  big?: boolean;
}) {
  return (
    <motion.button
      className={`music-ctrl ${big ? "big" : ""}`}
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

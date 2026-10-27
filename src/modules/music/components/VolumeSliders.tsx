import { useEffect, useRef, useState, type ReactNode } from "react";
import { ComputerIcon, MusicIcon } from "../../../components/icons";
import { useT } from "../../../core/i18n";
import { useIsland } from "../../../core/island";
import { setVolume, type MusicState, type Volume } from "../hooks/useMusic";

/** How long a change made here wins over the backend's (it polls every 0.5–1 s). */
const HOLD_MS = 1500;
const KEY_STEP = 0.05;

/** Two small sliders for the panel's footer: the player's, then the computer's. */
export function VolumeSliders({ music }: { music: MusicState | undefined }) {
  const t = useT();
  if (!music?.available) return null;
  return (
    <>

      {music.appVolume && (
        <VolumeSlider
          name={music.appDevice ? `${music.appName} · ${music.appDevice}` : music.appName}
          volume={music.appVolume}
          icon={music.appIcon ? <img src={music.appIcon} alt="" draggable={false} /> : <MusicIcon size={12} />}
          onChange={(change) => setVolume({ target: "app", appId: music.appId, ...change })}
        />
      )}

      {music.volume && (
        <VolumeSlider
          name={t("music.computer")}
          volume={music.volume}
          icon={<ComputerIcon size={13} />}
          onChange={(change) => setVolume({ target: "system", ...change })}
        />
      )}

    </>
  );
}

function VolumeSlider({
  name,
  volume,
  icon,
  onChange,
}: {
  name: string;
  volume: Volume;
  icon: ReactNode;
  onChange: (change: Partial<Volume>) => void;
}) {
  const t = useT();
  const island = useIsland();
  // What the user just set, shown until the backend has caught up.
  const [local, setLocal] = useState<Volume | null>(null);
  const holdTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(holdTimer.current), []);
  const shown = local ?? volume;

  const change = (next: Partial<Volume>) => {
    setLocal({ ...shown, ...next });
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => setLocal(null), HOLD_MS);
    onChange(next);
  };
  // Turning a muted slider up unmutes it, like the Windows mixer.
  const setLevel = (level: number) => {
    level = Math.round(Math.min(1, Math.max(0, level)) * 100) / 100;
    if (level === shown.level && !(shown.muted && level > 0)) return;
    change(shown.muted && level > 0 ? { level, muted: false } : { level });
  };
  const slide = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setLevel((e.clientX - r.left) / r.width);
  };

  const percent = Math.round(shown.level * 100);
  return (
    <div className={`volume-chip ${shown.muted ? "is-muted" : ""}`} onClick={(e) => e.stopPropagation()}>

      <button
        className="volume-chip-icon"
        title={t(shown.muted ? "music.unmute" : "music.mute", { name })}
        onClick={() => change({ muted: !shown.muted })}
      >
        {icon}
      </button>

      <div
        className="volume-chip-track"
        role="slider"
        tabIndex={0}
        title={`${name} · ${percent}%`}
        aria-label={t("music.volume", { name })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          // The pointer may wander off the island mid-drag.
          island.keepOpen(true, "volume");
          slide(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) slide(e);
        }}
        onLostPointerCapture={() => island.keepOpen(false, "volume")}
        onKeyDown={(e) => {
          const step = { ArrowRight: KEY_STEP, ArrowUp: KEY_STEP, ArrowLeft: -KEY_STEP, ArrowDown: -KEY_STEP }[e.key];
          if (step === undefined) return;
          e.preventDefault();
          setLevel(shown.level + step);
        }}
      >
        <div className="volume-chip-bar">
          <div className="volume-chip-fill" style={{ transform: `scaleX(${shown.level})` }} />
        </div>
      </div>

    </div>
  );
}

/**
 * Music module — Spotify and any other player exposed through the Windows
 * media controls (browsers, Apple Music, VLC…). Everything music-related lives
 * in this folder; its backend counterpart is `src-tauri/src/providers/music/`.
 */
import type { IslandModule, ModuleView } from "../../core/types";
import { Artwork } from "./components/Artwork";
import { MusicPanel } from "./components/MusicPanel";
import { Visualizer } from "./components/Visualizer";
import { useAccentColor } from "./hooks/useAccentColor";
import { useMusic } from "./hooks/useMusic";
import "./music.css";

export const musicModule: IslandModule = {
  id: "music",
  title: "Música",
  useView(): ModuleView {
    const { music, active } = useMusic();
    const accent = useAccentColor(music?.thumbnail);

    return {
      active,
      priority: music?.playing ? 50 : 10,
      icon: <Artwork src={music?.thumbnail} size={22} radius={11} />,
      compact: music && {
        left: <Artwork src={music.thumbnail} size={24} radius={7} trackKey={music.title} />,
        right: <Visualizer playing={music.playing} color={accent} />,
      },
      expanded: <MusicPanel music={music} accent={accent} />,
      expandedSize: { width: 560, height: 176 },
      activityKey: music?.playing ? `${music.title}|${music.artist}` : undefined,
    };
  },
};

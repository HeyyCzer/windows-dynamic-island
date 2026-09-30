/**
 * Music module — Spotify and any other player exposed through the Windows
 * media controls (browsers, Apple Music, VLC…). Everything music-related lives
 * in this folder; its backend counterpart is `src-tauri/src/providers/music/`.
 */
import { MusicIcon } from "../../components/icons";
import type { IslandModule, ModuleView } from "../../core/types";
import { Artwork } from "./components/Artwork";
import { MusicCompactLeft, MusicCompactRight } from "./components/MusicCompact";
import { MusicPanel } from "./components/MusicPanel";
import { useAccentColor } from "./hooks/useAccentColor";
import { useMusic } from "./hooks/useMusic";
import { musicSettings } from "./settings";
import { useSetting } from "../../core/settings";
import "./music.css";

export const musicModule: IslandModule = {
  id: "music",
  title: "music.title",
  settingsIcon: <MusicIcon size={15} />,
  settings: Object.values(musicSettings),
  useView(): ModuleView {
    const { music, active } = useMusic();
    const accent = useAccentColor(music?.thumbnail);
    const autoExpand = useSetting(musicSettings.autoExpand);
    const showVisualizer = useSetting(musicSettings.visualizer);

    return {
      active,
      priority: music?.playing ? 50 : 10,
      icon: <Artwork src={music?.thumbnail} size={22} radius={11} />,
      compact: music && {
        left: <MusicCompactLeft music={music} />,
        right: <MusicCompactRight music={music} accent={accent} showVisualizer={showVisualizer} />,
        width: 340,
      },
      expanded: <MusicPanel music={music} accent={accent} showVisualizer={showVisualizer} />,
      expandedSize: { width: 560, height: 176 },
      activityKey: autoExpand && music?.playing ? `${music.title}|${music.artist}` : undefined,
    };
  },
};

import { MusicIcon } from "lucide-react";
import { motion } from "motion/react";
import { Marquee } from "../../../components/Marquee";
import { useT } from "../../../core/i18n";
import { useSetting } from "../../../core/settings";
import { formatTime, type MusicState, musicAction, useLivePosition } from "../hooks/useMusic";
import { closePip, openPip, usePipOpen } from "../hooks/usePip";
import { musicSettings } from "../settings";
import { Artwork } from "./Artwork";
import { Controls } from "./Controls";
import { Visualizer } from "./Visualizer";
import { VolumeSliders } from "./VolumeSliders";
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
	const videoEnabled = useSetting(musicSettings.video);
	const mirror = useMirrorVideo(music?.youtubeId);
	// While pinned, only the pinned window plays the video.
	const video = videoEnabled && !pinned ? mirror : null;

	if (!music?.available) {
		return (
			<div className="flex h-full items-center justify-center gap-2.5 text-[14px] font-semibold text-text-faint">
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
		<div className="flex h-full items-center gap-4.5" style={{ "--accent": accent } as React.CSSProperties}>
			{video ? (
				// YouTube in a browser: the video itself plays here (muted, in sync with the tab).
				<div className="group/video relative h-28 w-50 flex-none overflow-hidden rounded-2xl bg-black">
					<YouTubeMirror videoId={video} positionMs={position} playing={music.playing} live={!music.durationMs} />
					<button
						type="button"
						className="absolute top-1.5 right-1.5 rounded-[11px] bg-black/65 px-2.25 py-0.75 text-[11.5px] font-semibold text-white opacity-0 transition-[opacity,background] duration-200 group-hover/video:opacity-100 hover:bg-[rgba(28,28,30,0.92)]"
						onClick={(e) => {
							e.stopPropagation();
							openPip();
						}}
					>
						{t("music.pin")}
					</button>
				</div>
			) : (
				<button
					type="button"
					className="relative block flex-none text-left transition-[opacity,color,transform] duration-200 hover:opacity-82 active:scale-97"
					title={music.appName}
					onClick={openPlayer}
				>
					<Artwork src={music.thumbnail} size={112} radius={20} trackKey={music.title} glow={accent} />
					{music.appIcon && !pinned && (
						<span className="pointer-events-none absolute -right-1 -bottom-1 grid size-6.5 place-items-center rounded-[9px] bg-[#1c1c1f] shadow-[0_0_0_2.5px_#000]">
							<img src={music.appIcon} alt="" draggable={false} className="size-4" />
						</span>
					)}
					{pinned && (
						<span
							className="absolute inset-x-1.5 bottom-1.5 cursor-pointer rounded-[11px] bg-black/65 px-2.25 py-0.75 text-center text-[10.5px] font-semibold text-white transition-[opacity,background] duration-200 hover:bg-[rgba(28,28,30,0.92)]"
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

			<div className="flex h-28 min-w-0 flex-1 flex-col justify-between">
				<div className="flex items-start gap-3">
					<div className="min-w-0 flex-1">
						<button
							type="button"
							className="relative block flex-none text-left transition-[opacity,color,transform] duration-200 hover:opacity-82 active:scale-97 w-full min-w-0"
							title={music.appName}
							onClick={openPlayer}
						>
							<Marquee text={music.title} className="text-[17px]/[1.3] font-[650] tracking-[-0.01em]" />
						</button>
						<Marquee text={subtitle} className="text-[13.5px]/[1.35] text-text-dim" />
					</div>
					{showVisualizer && (
						<Visualizer playing={music.playing} color={accent} height={30} barWidth={4.5} className="mt-1" />
					)}
				</div>

				<div className="flex items-center gap-2.5">
					<span className="min-w-9.5 text-[11px] text-text-faint">{formatTime(position)}</span>
					<div
						className="relative h-1.25 flex-1 cursor-pointer overflow-hidden rounded-full bg-white/14 transition-[height] duration-200 ease-[ease] hover:h-2"
						onClick={(e) => {
							if (!music.durationMs) return;
							const r = e.currentTarget.getBoundingClientRect();
							musicAction("seek", Math.round(((e.clientX - r.left) / r.width) * music.durationMs));
						}}
					>
						<motion.div
							className="absolute inset-0 origin-left rounded-[inherit] bg-[linear-gradient(90deg,color-mix(in_srgb,var(--accent)_70%,#fff),#fff)]"
							initial={false}
							animate={{ scaleX: Math.min(1, progress) }}
							transition={{ type: "tween", ease: "linear", duration: 0.25 }}
						/>
					</div>
					<span className="min-w-9.5 text-[11px] text-text-faint text-right">
						{music.durationMs ? `-${formatTime(music.durationMs - position)}` : "--:--"}
					</span>
				</div>

				<div className="-ml-1.5 flex items-center justify-between gap-3">
					<Controls music={music} />
					{/* Dragging a slider must not drag the island. */}
					<div className="flex min-w-0 flex-1 justify-end gap-1.5" data-no-drag>
						<VolumeSliders music={music} />
					</div>
				</div>
			</div>
		</div>
	);
}

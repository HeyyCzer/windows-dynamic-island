import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { type MouseEvent, useEffect, useRef, type WheelEvent } from "react";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from "../components/icons";
import { Marquee } from "../components/Marquee";
import { command, isTauri } from "../core/bridge";
import { useSyncLocale, useT } from "../core/i18n";
import { useSetting } from "../core/settings";
import { Artwork } from "../modules/music/components/Artwork";
import { useMirrorVideo, YouTubeMirror } from "../modules/music/components/YouTubeMirror";
import { formatTime, musicAction, useLivePosition, useMusic } from "../modules/music/hooks/useMusic";
import { closePip, PIP_RETURN_EVENT } from "../modules/music/hooks/usePip";
import { musicSettings } from "../modules/music/settings";
import { isBrowserApp } from "./browsers";

/** Closes itself once the browser's media has been gone this long. */
const MEDIA_LOST_MS = 5000;
/** A drag ends when the window stops moving for this long; then it snaps to edges. */
const SNAP_AFTER_MS = 220;

/**
 * The pinned video: a small always-on-top window with the browser's YouTube
 * video. Drag it anywhere (it snaps to edges and corners), scroll to resize,
 * hover for the controls.
 */
export function PipApp() {
	const t = useT();
	useSyncLocale();
	const { music } = useMusic();
	const position = useLivePosition(music);
	const video = useMirrorVideo(music?.youtubeId);
	const browser = !!music?.available && isBrowserApp(music.appName);
	const videoEnabled = useSetting(musicSettings.video);

	// The video was turned off in the settings: nothing left to pin.
	useEffect(() => {
		if (!videoEnabled) closePip();
	}, [videoEnabled]);

	// Close a few seconds after the browser tab (or the browser) went away.
	useEffect(() => {
		if (browser) return;
		const id = window.setTimeout(closePip, MEDIA_LOST_MS);
		return () => window.clearTimeout(id);
	}, [browser]);

	// Snap to the screen edges once a drag settles.
	const snapTimer = useRef<number | undefined>(undefined);
	useEffect(() => {
		if (!isTauri) return;
		let unlisten: (() => void) | undefined;
		getCurrentWindow()
			.onMoved(() => {
				window.clearTimeout(snapTimer.current);
				snapTimer.current = window.setTimeout(() => command("pip_snap"), SNAP_AFTER_MS);
			})
			.then((fn) => (unlisten = fn));
		return () => unlisten?.();
	}, []);

	const startDrag = (e: MouseEvent) => {
		if (e.button !== 0 || (e.target as Element).closest("button, [data-seek]")) return;
		if (isTauri) getCurrentWindow().startDragging();
	};
	const onWheel = (e: WheelEvent) => command("pip_resize", { delta: -Math.sign(e.deltaY) * 32 });

	const progress = music?.durationMs ? position / music.durationMs : 0;

	return (
		<div
			className="group fixed inset-0 cursor-grab overflow-hidden bg-black"
			data-pip
			onMouseDown={startDrag}
			onWheel={onWheel}
		>
			{video ? (
				<YouTubeMirror
					videoId={video}
					positionMs={position}
					playing={!!music?.playing}
					live={!music?.durationMs}
					className="absolute inset-0"
				/>
			) : (
				// Ads and videos that refuse embedding: the artwork until a video is back.
				<div className="absolute inset-0 grid place-items-center">
					<Artwork src={music?.thumbnail} size={96} radius={16} trackKey={music?.title} />
				</div>
			)}

			<div className="absolute inset-0 flex flex-col justify-between bg-[linear-gradient(180deg,rgba(0,0,0,0.7),transparent_38%,transparent_55%,rgba(0,0,0,0.8))] px-2.5 py-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
				<div className="flex items-center gap-1">
					<Marquee text={music?.title ?? ""} className="min-w-0 flex-1 text-[12.5px] font-semibold" />
					<button
						type="button"
						className="grid size-7 flex-none cursor-pointer place-items-center rounded-full text-[13px] text-white hover:bg-white/16"
						title={t("music.backToIsland")}
						onClick={() => {
							emit(PIP_RETURN_EVENT);
							closePip();
						}}
					>
						⤡
					</button>
					<button
						type="button"
						className="grid size-7 flex-none cursor-pointer place-items-center rounded-full text-[13px] text-white hover:bg-white/16"
						title={t("settings.close")}
						onClick={closePip}
					>
						✕
					</button>
				</div>
				<div className="flex flex-col gap-0.5">
					<div className="flex justify-center gap-2.5">
						<button
							type="button"
							className="grid size-7 flex-none cursor-pointer place-items-center rounded-full text-[13px] text-white hover:bg-white/16"
							onClick={() => musicAction("previous")}
						>
							<PrevIcon size={16} />
						</button>
						<button
							type="button"
							className="grid size-9 flex-none cursor-pointer place-items-center rounded-full text-[13px] text-white hover:bg-white/16"
							onClick={() => musicAction("toggle")}
						>
							{music?.playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
						</button>
						<button
							type="button"
							className="grid size-7 flex-none cursor-pointer place-items-center rounded-full text-[13px] text-white hover:bg-white/16"
							onClick={() => musicAction("next")}
						>
							<NextIcon size={16} />
						</button>
					</div>
					<div className="flex items-center gap-2 text-[10.5px] text-white/75 tabular-nums">
						<span>{formatTime(position)}</span>
						<div
							className="relative h-1 flex-1 cursor-pointer overflow-hidden rounded-full bg-white/25"
							data-seek
							onClick={(e) => {
								if (!music?.durationMs) return;
								const r = e.currentTarget.getBoundingClientRect();
								musicAction("seek", Math.round(((e.clientX - r.left) / r.width) * music.durationMs));
							}}
						>
							<div
								className="absolute inset-0 origin-left bg-white"
								style={{ transform: `scaleX(${Math.min(1, progress)})` }}
							/>
						</div>
						<span>{music?.durationMs ? formatTime(music.durationMs) : "--:--"}</span>
					</div>
				</div>
			</div>
		</div>
	);
}

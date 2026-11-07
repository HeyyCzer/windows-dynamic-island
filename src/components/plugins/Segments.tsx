import { PuzzleIcon } from "lucide-react";
import { cn } from "../../core/cn";
import { pluginUrl } from "../../core/plugins/store";
import type { Segment } from "../../core/plugins/types";

/** An image from a plugin's package, or a puzzle piece when it has none. */
export function PluginIcon({ pluginId, path, size = 15 }: { pluginId: string; path?: string; size?: number }) {
	if (!path) return <PuzzleIcon size={size} />;
	return (
		<img
			src={pluginUrl(pluginId, path)}
			width={size}
			height={size}
			alt=""
			draggable={false}
			className="flex-none object-contain"
		/>
	);
}

const list = (s: Segment | Segment[] | undefined) => (Array.isArray(s) ? s : s ? [s] : []);

/** Text a plugin set with `island.setView`, drawn by the island itself. */
export function Segments({ pluginId, segments }: { pluginId: string; segments: Segment | Segment[] | undefined }) {
	return (
		<>
			{list(segments).map((segment, i) => {
				const s = typeof segment === "string" ? { text: segment } : segment;
				return (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: segments have no identity besides their position
						key={i}
						className={cn(
							"flex min-w-0 items-center gap-1.5 truncate text-[13px]",
							s.bold && "font-[650]",
							s.mono && "font-[Cascadia_Code,Consolas,monospace] text-[12px] tabular-nums",
							s.dim && "text-text-dim",
						)}
						style={s.color ? { color: s.color } : undefined}
					>
						{s.icon && <PluginIcon pluginId={pluginId} path={s.icon} />}
						{s.text && <span className="truncate">{s.text}</span>}
					</span>
				);
			})}
		</>
	);
}

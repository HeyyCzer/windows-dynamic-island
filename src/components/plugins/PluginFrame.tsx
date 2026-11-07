import { useLayoutEffect, useRef } from "react";
import { cn } from "../../core/cn";
import { type FrameContext, registerFrame } from "../../core/plugins/host";
import type { PluginInfo } from "../../core/plugins/types";

/**
 * A plugin page in a sandboxed iframe: scripts only, an opaque origin (no
 * storage, no access to the island's page), and the `plugin://` protocol's
 * CSP (no network). It talks to the island through `core/plugins/host.ts`.
 */
export function PluginFrame({
	plugin,
	context,
	module = null,
	src,
	title,
	className,
}: {
	plugin: PluginInfo;
	context: FrameContext;
	module?: string | null;
	src: string;
	title: string;
	className?: string;
}) {
	const ref = useRef<HTMLIFrameElement>(null);

	// Before the page's first script runs, so its "hello" finds us.
	useLayoutEffect(() => {
		const win = ref.current?.contentWindow;
		if (!win) return;
		return registerFrame(win, plugin, context, module);
	}, [plugin, context, module]);

	return (
		<iframe
			ref={ref}
			src={src}
			title={title}
			// The backend keeps frames with this name on the plugin protocol (`plugins/frames.rs`).
			name="island-plugin"
			sandbox="allow-scripts"
			referrerPolicy="no-referrer"
			// Same scheme as the plugin's page, or Chromium paints the frame opaque.
			style={{ colorScheme: "dark" }}
			className={cn("block border-0 bg-transparent", className)}
		/>
	);
}

import { getCurrentWindow } from "@tauri-apps/api/window";
import React from "react";
import ReactDOM from "react-dom/client";
import { isTauri, startBridge } from "./core/bridge";
import { startPlugins } from "./core/plugins/store";
import { startSettings } from "./core/settings";
import "./styles.css";

startBridge();
startSettings();

// Same bundle for every window; pick the UI by window label
// (or `#settings` / `#pip` when previewing in a browser).
const label = isTauri ? getCurrentWindow().label : location.hash.slice(1) || "island";

// The PiP window never shows plugins.
if (label !== "pip") startPlugins();

// No browser context menu (reload, inspect…) in release builds.
if (import.meta.env.PROD) document.addEventListener("contextmenu", (e) => e.preventDefault());

// Browser preview only: fake wallpaper so the black island is visible.
if (!isTauri && label === "island") document.body.classList.add("preview");

type LoadUi = () => Promise<{ default: React.ComponentType }>;

// Each window loads only its own UI, so a webview doesn't keep the others' code in memory.
const windows: Record<string, LoadUi> = {
	island: async () => ({ default: (await import("./components/Island")).Island }),
	settings: async () => ({ default: (await import("./settings/SettingsApp")).SettingsApp }),
	pip: async () => ({ default: (await import("./pip/PipApp")).PipApp }),
};

const App = React.lazy(windows[label] ?? windows.island);

// Browser preview only: the panel that drives the mock (not in `?demo`, the README GIF).
// `import.meta.env.DEV` first, so release builds drop the chunk.
const showDevTools =
	import.meta.env.DEV && !isTauri && label === "island" && !new URLSearchParams(location.search).has("demo");
const DevTools = showDevTools && React.lazy(async () => ({ default: (await import("./dev/DevTools")).DevTools }));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<React.Suspense>
			<App />
			{DevTools && <DevTools />}
		</React.Suspense>
	</React.StrictMode>,
);

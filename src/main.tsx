import { getCurrentWindow } from "@tauri-apps/api/window";
import React from "react";
import ReactDOM from "react-dom/client";
import { isTauri, startBridge } from "./core/bridge";
import { startSettings } from "./core/settings";
import "./styles.css";

startBridge();
startSettings();

// Same bundle for every window; pick the UI by window label
// (or `#settings` / `#pip` when previewing in a browser).
const label = isTauri ? getCurrentWindow().label : location.hash.slice(1) || "island";

// No browser context menu (reload, inspect…) in release builds.
if (import.meta.env.PROD) document.addEventListener("contextmenu", (e) => e.preventDefault());

// Browser preview only: fake wallpaper so the black island is visible.
if (!isTauri && label === "island") document.body.classList.add("preview");

// Each window loads only its own UI: the settings and PiP webviews don't parse
// and keep in memory every island module, and the island skips the settings pages.
const App =
	label === "settings"
		? React.lazy(() => import("./settings/SettingsApp").then((m) => ({ default: m.SettingsApp })))
		: label === "pip"
			? React.lazy(() => import("./pip/PipApp").then((m) => ({ default: m.PipApp })))
			: React.lazy(() => import("./components/Island").then((m) => ({ default: m.Island })));

// Browser preview only: the panel that drives the mock (not in `?demo`, the README GIF).
const DevTools =
	import.meta.env.DEV && !isTauri && label === "island" && !new URLSearchParams(location.search).has("demo")
		? React.lazy(() => import("./dev/DevTools").then((m) => ({ default: m.DevTools })))
		: null;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<React.Suspense>
			<App />
		</React.Suspense>
		{DevTools && (
			<React.Suspense>
				<DevTools />
			</React.Suspense>
		)}
	</React.StrictMode>,
);

import { getCurrentWindow } from "@tauri-apps/api/window";
import React from "react";
import ReactDOM from "react-dom/client";
import { Island } from "./components/Island";
import { isTauri, startBridge } from "./core/bridge";
import { startPlugins } from "./core/plugins/store";
import { startSettings } from "./core/settings";
import { PipApp } from "./pip/PipApp";
import { SettingsApp } from "./settings/SettingsApp";
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

// Browser preview only: the panel that drives the mock (not in `?demo`, the README GIF).
const DevTools =
	import.meta.env.DEV && !isTauri && label === "island" && !new URLSearchParams(location.search).has("demo")
		? React.lazy(() => import("./dev/DevTools").then((m) => ({ default: m.DevTools })))
		: null;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		{label === "settings" ? <SettingsApp /> : label === "pip" ? <PipApp /> : <Island />}
		{DevTools && (
			<React.Suspense>
				<DevTools />
			</React.Suspense>
		)}
	</React.StrictMode>,
);

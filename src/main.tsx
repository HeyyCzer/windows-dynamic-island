import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Island } from "./components/Island";
import { isTauri, startBridge } from "./core/bridge";
import { startSettings } from "./core/settings";
import { SettingsApp } from "./settings/SettingsApp";
import "./styles.css";

startBridge();
startSettings();

// Same bundle for both windows; pick the UI by window label
// (or `#settings` when previewing in a browser).
const isSettingsWindow = isTauri ? getCurrentWindow().label === "settings" : location.hash === "#settings";

// No browser context menu (reload, inspect…) in release builds.
if (import.meta.env.PROD) document.addEventListener("contextmenu", (e) => e.preventDefault());

// Browser preview only: fake wallpaper so the black island is visible.
if (!isTauri && !isSettingsWindow) document.body.classList.add("preview");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isSettingsWindow ? <SettingsApp /> : <Island />}</React.StrictMode>,
);

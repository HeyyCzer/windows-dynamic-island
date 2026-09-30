import React from "react";
import ReactDOM from "react-dom/client";
import { Island } from "./components/Island";
import { isTauri, startBridge } from "./core/bridge";
import "./styles.css";

startBridge();

// Browser preview only: fake wallpaper so the black island is visible.
if (!isTauri) document.body.classList.add("preview");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Island />
  </React.StrictMode>,
);

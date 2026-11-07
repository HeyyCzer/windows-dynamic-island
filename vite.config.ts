import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { islandPlugins } from "./vite-plugin-island-plugins.ts";
import { locales } from "./vite-plugin-locales.ts";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
	plugins: [react(), tailwindcss(), locales(), islandPlugins()],
	define: { __APP_VERSION__: JSON.stringify(version) },
	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
		watch: { ignored: ["**/src-tauri/**"] },
	},
	// Only the app's page: the dep scan would otherwise crawl every .html, the
	// example plugins' too, and pull a second React from their node_modules.
	optimizeDeps: { entries: ["index.html"] },
	resolve: { dedupe: ["react", "react-dom"] },
	envPrefix: ["VITE_", "TAURI_ENV_*"],
	build: {
		target: "chrome120",
		minify: !process.env.TAURI_ENV_DEBUG,
		sourcemap: !!process.env.TAURI_ENV_DEBUG,
	},
});

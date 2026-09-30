import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { locales } from "./vite-plugin-locales.ts";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
	plugins: [react(), locales()],
	define: { __APP_VERSION__: JSON.stringify(version) },
	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
		watch: { ignored: ["**/src-tauri/**"] },
	},
	envPrefix: ["VITE_", "TAURI_ENV_*"],
	build: {
		target: "chrome120",
		minify: !process.env.TAURI_ENV_DEBUG,
		sourcemap: !!process.env.TAURI_ENV_DEBUG,
	},
});

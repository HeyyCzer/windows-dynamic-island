import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { locales } from "./vite-plugin-locales";

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react(), locales()],
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

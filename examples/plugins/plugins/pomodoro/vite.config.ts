import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `dist/` is the plugin package: the panel page, the background script, and
// `public/` (plugin.json, locales, icon) copied as is.
export default defineConfig({
	plugins: [react()],
	// The island serves the plugin under /<id>/: keep every URL relative.
	base: "./",
	build: {
		outDir: "dist",
		emptyOutDir: true,
		// The CSP allows the plugin's own files only; no inline scripts.
		modulePreload: false,
		rollupOptions: {
			input: { panel: "panel.html", background: "src/background.ts" },
			output: {
				// plugin.json points at these names.
				entryFileNames: "[name].js",
				chunkFileNames: "chunks/[name]-[hash].js",
				assetFileNames: "assets/[name]-[hash][extname]",
			},
		},
	},
});

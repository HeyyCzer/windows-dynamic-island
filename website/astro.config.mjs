import { defineConfig } from "astro/config";

// Served by GitHub Pages at heyyczer.github.io/windows-dynamic-island, so every
// internal link goes through `import.meta.env.BASE_URL`.
export default defineConfig({
  site: "https://heyyczer.github.io",
  base: "/windows-dynamic-island",
  trailingSlash: "ignore",
  i18n: {
    defaultLocale: "en",
    locales: ["en", "pt-br"],
    routing: { prefixDefaultLocale: false },
  },
  vite: {
    // Screenshots, the app icon and the privacy policy live in the repo root.
    server: { fs: { allow: [".."] } },
  },
});

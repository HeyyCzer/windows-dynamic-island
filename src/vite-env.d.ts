/// <reference types="vite/client" />

/** `version` from package.json, injected by vite.config.ts. */
declare const __APP_VERSION__: string;

/** Locale files, flattened to `{ "dotted.key": "text" }` by vite-plugin-locales. */
declare module "*.json5" {
  const messages: Record<string, string>;
  export default messages;
}

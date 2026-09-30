/// <reference types="vite/client" />

/** Locale files, flattened to `{ "dotted.key": "text" }` by vite-plugin-locales. */
declare module "*.json5" {
  const messages: Record<string, string>;
  export default messages;
}

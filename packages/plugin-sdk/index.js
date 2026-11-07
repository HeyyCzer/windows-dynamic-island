/**
 * The runtime is injected by the app, so this only hands the global back for
 * code that prefers `import { island } from "@windows-island/plugin-sdk"`.
 */
export const island = globalThis.island;
export default island;

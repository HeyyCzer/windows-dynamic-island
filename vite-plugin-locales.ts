import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import JSON5 from "json5";
import type { Plugin } from "vite";

const LOCALES_DIR = resolve(import.meta.dirname, "src/locales");
const REFERENCE = resolve(LOCALES_DIR, "en.json5");
const KEYS_FILE = resolve(LOCALES_DIR, "keys.gen.ts");

/** `{ a: { b: "x" } }` → `{ "a.b": "x" }` */
export function flatten(tree: Record<string, unknown>, prefix = "", out: Record<string, string> = {}) {
	for (const [key, value] of Object.entries(tree)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (value && typeof value === "object") flatten(value as Record<string, unknown>, path, out);
		else out[path] = String(value);
	}
	return out;
}

/** Regenerates `keys.gen.ts` (the `MessageKey` union) from the reference locale. */
function writeKeys() {
	const keys = Object.keys(flatten(JSON5.parse(readFileSync(REFERENCE, "utf8"))));
	const text =
		"// Generated from en.json5 by vite-plugin-locales.ts — do not edit.\n" +
		`export type MessageKey =\n${keys.map((k) => `  | ${JSON.stringify(k)}`).join("\n")};\n`;
	let current = "";
	try {
		current = readFileSync(KEYS_FILE, "utf8");
	} catch {
		/* first run */
	}
	if (current !== text) writeFileSync(KEYS_FILE, text);
}

/**
 * Lets `src/locales/*.json5` be imported as flat `{ "dotted.key": "text" }`
 * objects, and keeps the typed key list in sync with `en.json5`.
 */
export function locales(): Plugin {
	return {
		name: "locales",
		buildStart() {
			writeKeys();
		},
		transform(code, id) {
			if (!id.endsWith(".json5")) return;
			return { code: `export default ${JSON.stringify(flatten(JSON5.parse(code)))};`, map: null };
		},
		handleHotUpdate({ file }) {
			if (resolve(file) === REFERENCE) writeKeys();
		},
	};
}

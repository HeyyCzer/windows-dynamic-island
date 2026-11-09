/**
 * Browser preview only (`bun run dev`): serves the example plugins in
 * `examples/plugins/` the way the app's `plugin://` protocol serves installed
 * ones (`src-tauri/src/plugins/protocol.rs`): SDK injected into HTML, a CSP
 * that keeps each plugin to its own files, CORS for sandboxed frames. Lets
 * the plugin runtime be designed and tested without Windows.
 *
 * - `/__plugins/__list.json`: the examples as `plugins_list` would report them
 * - `/__plugins/__index.json`: the examples' `island-plugins.json`
 * - `/__plugins/<id>/<path>`: a plugin's files (`__background.html` generated)
 * - `/__sdk/<major>.js|css`: the SDK runtime
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import type { Plugin } from "vite";
// @ts-expect-error plain JS, no types
import { validate } from "./packages/plugin-sdk/cli.mjs";
import { flatten } from "./vite-plugin-locales.ts";

const ROOT = resolve(import.meta.dirname, "examples/plugins");
const SDK_DIR = resolve(import.meta.dirname, "packages/plugin-sdk/runtime");
const SDK_MAJOR = 1;

const TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".woff2": "font/woff2",
};

interface Package {
	dir: string;
	manifest: Record<string, unknown>;
}

/** Every example whose folder (or `dist/`) holds a `plugin.json`. */
function packages(): Map<string, Package> {
	const found = new Map<string, Package>();
	const dir = join(ROOT, "plugins");
	if (!existsSync(dir)) return found;
	for (const name of readdirSync(dir)) {
		for (const candidate of [join(dir, name), join(dir, name, "dist")]) {
			const file = join(candidate, "plugin.json");
			if (!existsSync(file)) continue;
			const manifest = JSON.parse(readFileSync(file, "utf8"));
			found.set(manifest.id, { dir: candidate, manifest });
			break;
		}
	}
	return found;
}

/** Same defaults as the backend's serde. */
function normalize(manifest: Record<string, unknown>) {
	const modules = ((manifest.modules as Record<string, unknown>[]) ?? []).map((m) => ({
		enabledByDefault: true,
		...m,
	}));
	return { settings: [], shortcuts: [], permissions: [], persistent: false, ...manifest, modules };
}

function messages(dir: string) {
	const out: Record<string, Record<string, string>> = {};
	const locales = join(dir, "locales");
	if (!existsSync(locales)) return out;
	for (const file of readdirSync(locales).filter((f) => f.endsWith(".json"))) {
		out[file.slice(0, -5)] = flatten(JSON.parse(readFileSync(join(locales, file), "utf8")));
	}
	return out;
}

function withSdk(html: string) {
	const tags = `<link rel="stylesheet" href="/__sdk/${SDK_MAJOR}.css"><script src="/__sdk/${SDK_MAJOR}.js"></script>`;
	const head = html.match(/<head[^>]*>/i);
	if (head?.index !== undefined) {
		const at = head.index + head[0].length;
		return html.slice(0, at) + tags + html.slice(at);
	}
	return tags + html;
}

function send(res: ServerResponse, status: number, type: string, body: string | Buffer, csp?: string) {
	res.statusCode = status;
	res.setHeader("Content-Type", type);
	res.setHeader("Cache-Control", "no-store");
	res.setHeader("Access-Control-Allow-Origin", "*");
	if (csp) res.setHeader("Content-Security-Policy", csp);
	res.end(body);
}

function csp(origin: string, id: string) {
	const own = `${origin}/__plugins/${id}/ ${origin}/__sdk/`;
	return [
		"default-src 'none'",
		`script-src ${own}`,
		`style-src ${own} 'unsafe-inline'`,
		`img-src ${own} data: blob:`,
		`font-src ${own} data:`,
		`media-src ${own} data: blob:`,
		"connect-src 'none'",
		"frame-src 'none'",
		"worker-src 'none'",
		"object-src 'none'",
		"form-action 'none'",
		"base-uri 'none'",
	].join("; ");
}

export function islandPlugins(): Plugin {
	return {
		name: "island-plugins",
		apply: "serve",
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const url = new URL(req.url ?? "/", "http://localhost");
				const origin = `http://${req.headers.host}`;
				const path = decodeURIComponent(url.pathname);

				const sdk = path.match(/^\/__sdk\/(\d+)\.(js|css)$/);
				if (sdk) {
					if (Number(sdk[1]) !== SDK_MAJOR) return send(res, 404, "text/plain", "unknown SDK version");
					const file = join(SDK_DIR, `v${SDK_MAJOR}.${sdk[2]}`);
					return send(res, 200, TYPES[`.${sdk[2]}`], readFileSync(file));
				}
				if (!path.startsWith("/__plugins/")) return next();

				const rest = path.slice("/__plugins/".length);
				if (rest === "__list.json") {
					const list = [...packages().values()].map(({ dir, manifest }) => {
						// Same checks as the app, so the preview doesn't run what the app would refuse.
						const { errors } = validate(dir) as { errors: string[] };
						return {
							id: manifest.id,
							version: manifest.version,
							manifest: errors.length ? null : normalize(manifest),
							messages: messages(dir),
							source: null,
							dev: true,
							devPath: dir,
							granted: manifest.permissions ?? [],
							installedAt: 0,
							problem: errors.length ? "invalid" : null,
							error: errors.length ? errors.join("; ") : null,
						};
					});
					return send(res, 200, TYPES[".json"], JSON.stringify(list));
				}
				if (rest === "__index.json") {
					const index = join(ROOT, "island-plugins.json");
					if (!existsSync(index)) return send(res, 404, "text/plain", "no index");
					return send(res, 200, TYPES[".json"], readFileSync(index));
				}

				const [id, ...parts] = rest.split("/");
				const pkg = packages().get(id);
				if (!pkg) return send(res, 404, "text/plain", "no such plugin");
				const name = parts.join("/");
				const policy = csp(origin, id);
				if (name === "__background.html") {
					const background = pkg.manifest.background as string | undefined;
					if (!background) return send(res, 404, "text/plain", "no background");
					if (!background.endsWith(".html")) {
						const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="./${background}"></script></body></html>`;
						return send(res, 200, TYPES[".html"], withSdk(html), policy);
					}
					parts.splice(0, parts.length, ...background.split("/"));
				}
				const file = resolve(pkg.dir, ...parts);
				if (!file.startsWith(pkg.dir + sep) || !existsSync(file) || !statSync(file).isFile()) {
					return send(res, 404, "text/plain", "not found");
				}
				const type = TYPES[extname(file)] ?? "application/octet-stream";
				const body = type.startsWith("text/html") ? withSdk(readFileSync(file, "utf8")) : readFileSync(file);
				return send(res, 200, type, body, policy);
			});
		},
	};
}

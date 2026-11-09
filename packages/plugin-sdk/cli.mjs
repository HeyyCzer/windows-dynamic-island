#!/usr/bin/env node
/**
 * island-plugin: checks, packs and indexes Island for Windows plugins.
 *
 *   island-plugin validate <package-dir>
 *   island-plugin pack <package-dir> [out-dir]
 *   island-plugin index [repo-root] [--base-url <url>]
 *
 * A *package dir* has `plugin.json` at its root (a plain-JS plugin's folder,
 * or the build output of a bundled one). `index` walks `plugins/*` of a source
 * repository, packs each plugin into `packages/<id>-<version>.zip` and writes
 * `island-plugins.json`. Zips are deterministic: the same files give the same
 * SHA-256. Node 18+ or Bun, no dependencies. See docs/plugins/publishing.md.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { deflateRawSync } from "node:zlib";

const SDK = [1, 0];
const ID = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const PATH_VARS = ["$HOME", "$APPDATA", "$LOCALAPPDATA", "$DOCUMENTS"];
const PROVIDERS = ["music", "monitor"];
const SKIP = new Set(["node_modules", ".git", ".DS_Store"]);

function fail(message) {
	console.error(`✕ ${message}`);
	process.exit(1);
}

/** Every file below `dir`, relative, forward slashes, sorted. */
function files(dir) {
	const out = [];
	const walk = (d) => {
		for (const name of readdirSync(d)) {
			if (SKIP.has(name) || name.startsWith(".")) continue;
			const path = join(d, name);
			if (statSync(path).isDirectory()) walk(path);
			else out.push(relative(dir, path).split(sep).join("/"));
		}
	};
	walk(dir);
	return out.sort();
}

function flatten(tree, prefix = "", out = {}) {
	for (const [key, value] of Object.entries(tree)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (value && typeof value === "object") flatten(value, path, out);
		else out[path] = String(value);
	}
	return out;
}

function locales(dir) {
	const out = {};
	const folder = join(dir, "locales");
	if (!existsSync(folder)) return out;
	for (const name of readdirSync(folder).filter((n) => n.endsWith(".json"))) {
		out[name.slice(0, -5)] = flatten(JSON.parse(readFileSync(join(folder, name), "utf8")));
	}
	return out;
}

function validPermission(p) {
	if (["clipboard:read", "clipboard:write", "open-url"].includes(p)) return true;
	if (p.startsWith("network:")) {
		const [host, port] = p.slice(8).split(":");
		const bare = host.replace(/^\*\./, "");
		return (
			bare.includes(".") &&
			bare.split(".").every((l) => /^[a-z0-9-]{1,63}$/.test(l)) &&
			(port === undefined || (/^\d+$/.test(port) && Number(port) < 65536))
		);
	}
	if (p.startsWith("fs:read:")) {
		const pattern = p.slice(8);
		const v = PATH_VARS.find((v) => pattern.startsWith(v));
		if (!v) return false;
		const parts = pattern.slice(v.length).split("/").filter(Boolean);
		return (
			!parts.includes("..") &&
			parts.slice(0, -1).every((x) => !x.includes("*")) &&
			(!parts.at(-1)?.includes("*") || ["*", "**"].includes(parts.at(-1)))
		);
	}
	if (p.startsWith("provider:")) return PROVIDERS.includes(p.slice(9));
	return false;
}

/** Same rules as the app (`src-tauri/src/plugins/manifest.rs`), plus missing strings. */
export function validate(dir) {
	const errors = [];
	const warnings = [];
	const manifestPath = join(dir, "plugin.json");
	if (!existsSync(manifestPath)) return { errors: [`no plugin.json in ${dir}`], warnings, manifest: null };
	let m;
	try {
		m = JSON.parse(readFileSync(manifestPath, "utf8"));
	} catch (e) {
		return { errors: [`plugin.json: ${e.message}`], warnings, manifest: null };
	}
	const list = files(dir);
	const has = (p) => list.includes(p);
	const id = (what, value, max = 32) => {
		if (typeof value !== "string" || !ID.test(value) || value.length > max)
			errors.push(`${what}: '${value}' must be a-z, 0-9 and -`);
	};

	id("id", m.id, 48);
	if (typeof m.id === "string" && m.id.length < 2) errors.push("id: at least 2 characters");
	if (!VERSION.test(m.version ?? "")) errors.push(`version: '${m.version}' is not x.y.z`);
	const sdk = String(m.sdk ?? "").match(/^(\d+)(?:\.(\d+))?$/);
	if (!sdk) errors.push(`sdk: '${m.sdk}' is not major.minor`);
	else if (Number(sdk[1]) !== SDK[0] || Number(sdk[2] ?? 0) > SDK[1])
		errors.push(`sdk ${m.sdk} isn't supported by this SDK (${SDK.join(".")})`);
	if (!m.name) errors.push("name is required");
	if (m.homepage && !m.homepage.startsWith("https://")) errors.push("homepage: only https links");
	const modules = m.modules ?? [];
	if (!modules.length && !m.background) errors.push("a plugin needs a module or a background script");
	if (m.persistent !== undefined && typeof m.persistent !== "boolean") errors.push("persistent: true or false");
	if (m.persistent && !m.background) errors.push("'persistent' needs a background script");

	const paths = [m.icon, m.background, ...modules.flatMap((x) => [x.icon, x.panel])].filter(Boolean);
	for (const p of paths) {
		if (p.startsWith("/") || p.includes("..") || p.includes("\\") || p.includes(":"))
			errors.push(`path '${p}' must stay in the package`);
		else if (!has(p)) errors.push(`plugin.json points at '${p}', which isn't in ${dir}`);
	}
	for (const x of modules) id("module id", x.id);
	for (const s of m.settings ?? []) {
		id("setting key", s.key);
		const ok = {
			boolean: typeof s.default === "boolean",
			number: typeof s.default === "number" && (s.min ?? -Infinity) <= s.default && s.default <= (s.max ?? Infinity),
			string: typeof s.default === "string",
			select: (s.options ?? []).some((o) => o.value === s.default),
		}[s.type];
		if (!ok) errors.push(`setting '${s.key}': default doesn't fit type '${s.type}'`);
	}
	for (const s of m.shortcuts ?? []) id("shortcut id", s.id);
	for (const p of m.permissions ?? []) if (!validPermission(p)) errors.push(`unknown permission '${p}'`);

	const messages = locales(dir);
	if (!messages.en) errors.push("locales/en.json is required");
	else {
		const keys = [
			m.name,
			m.description,
			...modules.map((x) => x.title),
			...(m.settings ?? []).flatMap((s) => [s.label, s.description, s.unit, ...(s.options ?? []).map((o) => o.label)]),
			...(m.shortcuts ?? []).map((s) => s.label),
		].filter(Boolean);
		for (const key of keys) if (!(key in messages.en)) warnings.push(`'${key}' isn't in locales/en.json`);
		for (const [code, entries] of Object.entries(messages)) {
			const missing = Object.keys(messages.en).filter((k) => !(k in entries));
			if (missing.length)
				warnings.push(`locales/${code}.json is missing ${missing.length} key(s): ${missing.join(", ")}`);
		}
	}
	return { errors, warnings, manifest: m, messages };
}

// Minimal deterministic zip writer (deflate, no timestamps).
const CRC = new Int32Array(256).map((_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c;
});
function crc32(buf) {
	let c = -1;
	for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ -1) >>> 0;
}

function zip(entries) {
	const local = [];
	const central = [];
	let offset = 0;
	const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
	for (const { name, data } of entries) {
		const nameBuf = Buffer.from(name, "utf8");
		const deflated = deflateRawSync(data, { level: 9 });
		const stored = deflated.length >= data.length;
		const body = stored ? data : deflated;
		const crc = crc32(data);
		const header = Buffer.alloc(30);
		header.writeUInt32LE(0x04034b50, 0);
		header.writeUInt16LE(20, 4);
		header.writeUInt16LE(0x0800, 6); // UTF-8 names
		header.writeUInt16LE(stored ? 0 : 8, 8);
		header.writeUInt16LE(0, 10);
		header.writeUInt16LE(DOS_DATE, 12);
		header.writeUInt32LE(crc, 14);
		header.writeUInt32LE(body.length, 18);
		header.writeUInt32LE(data.length, 22);
		header.writeUInt16LE(nameBuf.length, 26);
		header.writeUInt16LE(0, 28);
		local.push(header, nameBuf, body);

		const entry = Buffer.alloc(46);
		entry.writeUInt32LE(0x02014b50, 0);
		entry.writeUInt16LE(20, 4);
		entry.writeUInt16LE(20, 6);
		entry.writeUInt16LE(0x0800, 8);
		entry.writeUInt16LE(stored ? 0 : 8, 10);
		entry.writeUInt16LE(0, 12);
		entry.writeUInt16LE(DOS_DATE, 14);
		entry.writeUInt32LE(crc, 16);
		entry.writeUInt32LE(body.length, 20);
		entry.writeUInt32LE(data.length, 24);
		entry.writeUInt16LE(nameBuf.length, 28);
		entry.writeUInt32LE(offset, 42);
		central.push(entry, nameBuf);
		offset += header.length + nameBuf.length + body.length;
	}
	const centralBuf = Buffer.concat(central);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralBuf.length, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...local, centralBuf, end]);
}

function report(dir, { errors, warnings }) {
	for (const w of warnings) console.warn(`! ${w}`);
	if (errors.length) fail(`${dir}:\n  ${errors.join("\n  ")}`);
}

export function pack(dir, outDir) {
	const result = validate(dir);
	report(dir, result);
	const { manifest } = result;
	const bytes = zip(files(dir).map((name) => ({ name, data: readFileSync(join(dir, name)) })));
	mkdirSync(outDir, { recursive: true });
	const file = join(outDir, `${manifest.id}-${manifest.version}.zip`);
	writeFileSync(file, bytes);
	const sha256 = createHash("sha256").update(bytes).digest("hex");
	return { file, sha256, ...result };
}

/** The folder of `plugins/<name>` that holds plugin.json: itself or its build output. */
function packageDir(dir) {
	for (const candidate of [dir, join(dir, "dist")]) if (existsSync(join(candidate, "plugin.json"))) return candidate;
	return null;
}

function localized(messages, key) {
	if (!key) return undefined;
	const text = Object.fromEntries(Object.entries(messages).flatMap(([code, m]) => (key in m ? [[code, m[key]]] : [])));
	return Object.keys(text).length ? text : key;
}

function index(root, baseUrl) {
	const pluginsDir = join(root, "plugins");
	if (!existsSync(pluginsDir)) fail(`no plugins/ folder in ${root}`);
	const out = join(root, "packages");
	const existing = existsSync(join(root, "island-plugins.json"))
		? JSON.parse(readFileSync(join(root, "island-plugins.json"), "utf8"))
		: {};
	const listings = [];
	for (const name of readdirSync(pluginsDir).sort()) {
		const dir = packageDir(join(pluginsDir, name));
		if (!dir) {
			console.warn(`! plugins/${name}: no plugin.json (not built yet?), skipped`);
			continue;
		}
		const { file, sha256, manifest: m, messages } = pack(dir, out);
		const rel = (p) => relative(root, p).split(sep).join("/");
		const url = (p) => (baseUrl ? `${baseUrl.replace(/\/$/, "")}/${p.split("/").pop()}` : p);
		listings.push({
			id: m.id,
			version: m.version,
			sdk: m.sdk,
			name: localized(messages, m.name),
			description: localized(messages, m.description),
			author: m.author,
			homepage: m.homepage,
			icon: m.icon ? rel(join(dir, m.icon)) : undefined,
			permissions: m.permissions ?? [],
			persistent: m.persistent === true || undefined,
			package: url(rel(file)),
			sha256,
		});
		console.log(`✓ ${m.id} ${m.version}  ${sha256.slice(0, 12)}…  ${rel(file)}`);
	}
	const ids = listings.map((l) => l.id);
	const dup = ids.find((id, i) => ids.indexOf(id) !== i);
	if (dup) fail(`two plugins are called '${dup}'`);
	const indexFile = join(root, "island-plugins.json");
	writeFileSync(indexFile, `${JSON.stringify({ schema: 1, name: existing.name, plugins: listings }, null, "\t")}\n`);
	console.log(`✓ ${relative(process.cwd(), indexFile) || indexFile}: ${listings.length} plugin(s)`);
}

const [command, ...args] = process.argv.slice(2);
const flag = (name) => {
	const i = args.indexOf(name);
	return i === -1 ? undefined : args.splice(i, 2)[1];
};

if (import.meta.url === `file://${resolve(process.argv[1] ?? "")}` || process.argv[1]?.endsWith("cli.mjs")) {
	switch (command) {
		case "validate": {
			const dir = resolve(args[0] ?? ".");
			const result = validate(dir);
			report(dir, result);
			console.log(`✓ ${result.manifest.id} ${result.manifest.version} is valid`);
			break;
		}
		case "pack": {
			const { file, sha256 } = pack(resolve(args[0] ?? "."), resolve(args[1] ?? "."));
			console.log(`✓ ${file}\n  sha256 ${sha256}`);
			break;
		}
		case "index": {
			const baseUrl = flag("--base-url");
			index(resolve(args[0] ?? "."), baseUrl);
			break;
		}
		default:
			console.log(
				"island-plugin validate <package-dir>\n" +
					"island-plugin pack <package-dir> [out-dir]\n" +
					"island-plugin index [repo-root] [--base-url <url>]",
			);
			process.exit(command ? 1 : 0);
	}
}

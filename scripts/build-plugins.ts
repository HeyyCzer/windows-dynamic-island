import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { compile, optimize } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import type { BunPlugin } from "bun";
import * as React from "react";
import * as JSX from "react/jsx-runtime";
import { MARKETPLACE_CATALOG } from "../plugins/catalog.source";
import { PLUGIN_GUIDES } from "../plugins/guides";
import release from "../plugins/release.json";

const root = resolve(import.meta.dir, "..");
const generated = join(root, "plugins/.generated");
const output = join(root, "plugins/dist");
await mkdir(generated, { recursive: true });
await mkdir(output, { recursive: true });
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const normalize = (path: string) => path.replace(/\\/g, "/");
const styleSource = await readFile(join(root, "src/styles.css"), "utf8");
async function buildPluginCss(widget: string) {
	const scan = new Scanner({
		sources: [
			{ base: root, pattern: `src/core/plugins/widgets/${widget}.tsx`, negated: false },
			{ base: root, pattern: "src/core/plugins/widgets/NeedsConfigCard.tsx", negated: false },
			{ base: root, pattern: "src/components/ui/**/*.{ts,tsx}", negated: false },
			{ base: root, pattern: "src/settings/components/Toggle.tsx", negated: false },
		],
	});
	const styles = await compile(styleSource, { base: join(root, "src"), onDependency: () => {} });
	let css = optimize(styles.build(scan.scan()), { minify: true }).code;
	if (widget === "NavoPathWidget")
		css += await readFile(join(root, "src/core/plugins/widgets/NavoPathWidget.css"), "utf8");
	return css;
}
const moduleExports = (scope: string, names: string[]) =>
	`const sdk=globalThis.__ISLAND_PLUGIN_SDK__; export const {${names.filter((n) => n !== "default" && n !== "__esModule").join(",")}}=sdk.${scope};`;
const virtual = new Map<string, string>();
virtual.set("react", `${moduleExports("React", Object.keys(React))}export default sdk.React;`);
virtual.set("react/jsx-runtime", moduleExports("JSX", Object.keys(JSX)));
virtual.set("react/jsx-dev-runtime", moduleExports("JSX", Object.keys(JSX)));
virtual.set("motion/react", moduleExports("Motion", ["motion", "AnimatePresence"]));
virtual.set("@tauri-apps/api/event", moduleExports("Events", ["listen", "emit"]));
const transpiler = new Bun.Transpiler({ loader: "tsx" });
const alias = async (path: string, scope: string) => {
	const full = resolve(root, path);
	const source = await readFile(full, "utf8");
	virtual.set(normalize(full).replace(/\.tsx?$/, ""), moduleExports(scope, transpiler.scan(source).exports));
};
await alias("src/core/bridge.ts", "Bridge");
await alias("src/core/island.ts", "Island");
await alias("src/core/i18n.ts", "I18n");
await alias("src/core/settings.ts", "Settings");
await alias("src/core/plugins/registry.tsx", "Registry");
for (const [file, scope] of [
	["button", "Buttons"],
	["card", "Cards"],
	["form", "Forms"],
	["text", "Text"],
])
	await alias(`src/components/ui/${file}.tsx`, `UI.${scope}`);
for (const [file, name] of [["src/settings/components/Toggle.tsx", "Toggle"]])
	virtual.set(normalize(resolve(root, file)).replace(/\.tsx?$/, ""), moduleExports("UI", [name]));
for (const [file, name] of [
	["src/core/plugins/useNavoPath.ts", "useNavoPath"],
	["src/core/plugins/useNavoPathConnection.ts", "useNavoPathConnection"],
])
	virtual.set(normalize(resolve(root, file)).replace(/\.tsx?$/, ""), moduleExports("hooks", [name]));
virtual.set(
	normalize(resolve(root, "src/core/plugins/catalog")),
	"export const MARKETPLACE_CATALOG=globalThis.__ISLAND_PLUGIN_SDK__.getCatalog();",
);
virtual.set(
	normalize(resolve(root, "src/assets/navopath.png")),
	"export default globalThis.__ISLAND_PLUGIN_SDK__.assets.navopath;",
);
const sdkPlugin: BunPlugin = {
	name: "island-shared-sdk",
	setup(build) {
		build.onResolve({ filter: /.*/ }, (args) => {
			const direct = virtual.has(args.path)
				? args.path
				: normalize(resolve(dirname(args.importer), args.path)).replace(/\.tsx?$/, "");
			if (virtual.has(direct)) return { path: direct, namespace: "island-sdk" };
			if (args.path.endsWith("NavoPathWidget.css")) return { path: "empty-css", namespace: "island-sdk" };
		});
		build.onLoad({ filter: /.*/, namespace: "island-sdk" }, (args) => ({
			contents: virtual.get(args.path) || "export {};",
			loader: "js",
		}));
	},
};
const entries: Record<string, string> = {
	"com.island.pomodoro": "PomodoroWidget",
	"com.island.crypto-ticker": "CryptoTickerWidget",
	"com.island.work-countdown": "WorkCountdownWidget",
	"com.island.weather": "WeatherWidget",
	"com.island.quick-memo": "QuickMemoWidget",
	"com.island.steam-friends": "SteamFriendsWidget",
	"com.island.navopath": "NavoPathWidget",
	"com.island.everything": "EverythingWidget",
	"com.island.obsidian": "ObsidianWidget",
	"com.island.vpn": "VpnWidget",
	"com.island.im-notifications": "ImNotificationWidget",
};
const diagnosticNames: Record<string, string> = {
	"com.island.navopath": "diagnoseNavoPath",
	"com.island.vpn": "diagnoseVpn",
	"com.island.obsidian": "diagnoseObsidian",
	"com.island.everything": "diagnoseEverything",
};
const descriptors = [];
for (const source of MARKETPLACE_CATALOG) {
	const widget = entries[source.id];
	if (!widget) throw Error(`Missing entry ${source.id}`);
	const css = await buildPluginCss(widget);
	const manifest = {
		...source,
		sdkVersion: 1,
		guide: PLUGIN_GUIDES[source.id],
		permissions: ["在灵动岛窗口执行代码", "使用宿主提供的界面与系统接口"],
	};
	const diagnose = diagnosticNames[source.id];
	let background = "";
	if (source.id === "com.island.vpn")
		background = `import {useVpnMonitor} from '../../src/core/plugins/useVpn';import {useT} from '../../src/core/i18n';function Background({settings}){const value=useVpnMonitor(settings);const t=useT();React.useEffect(()=>{sdk.setPluginActivity('${source.id}',{left:value.snapshot?.proxies[value.group]?.now||'VPN',right:t(value.busy?'marketplace.widgets.vpn.testing':value.error?'marketplace.widgets.vpn.statusError':'marketplace.widgets.vpn.statusMonitoring')});},[value,t]);return null;}`;
	if (source.id === "com.island.pomodoro")
		background = `import {usePomodoroLive,startPomodoroBackground} from '../../src/core/plugins/pluginActivityStore';function Background({settings}){const value=usePomodoroLive();React.useEffect(()=>startPomodoroBackground(),[]);React.useEffect(()=>value.setDurations(Number(settings.workDuration??25),Number(settings.breakDuration??5)),[settings.workDuration,settings.breakDuration,value.setDurations]);React.useEffect(()=>{sdk.setPluginActivity('${source.id}',{active:value.isRunning,priority:85,left:value.mode==='work'?'专注':'休息',right:value.formattedTime,progress:value.progressPercent});},[value.isRunning,value.mode,value.formattedTime,value.progressPercent]);return null;}`;
	const entry = `import * as React from 'react';import {${widget}} from '../../src/core/plugins/widgets/${widget}';${diagnose ? `import {${diagnose}} from '../diagnostics';` : ""}const sdk=globalThis.__ISLAND_PLUGIN_SDK__;${background}sdk.registerPlugin(${JSON.stringify(source.id)},${JSON.stringify(manifest.version)},{Panel:${widget}${background ? ",Background" : ""}${diagnose ? `,diagnose:${diagnose}` : ""}});`;
	const entryPath = join(generated, `${source.id}.tsx`);
	await writeFile(entryPath, entry);
	const result = await Bun.build({
		entrypoints: [entryPath],
		outdir: generated,
		target: "browser",
		format: "iife",
		minify: true,
		plugins: [sdkPlugin],
		define: { "process.env.NODE_ENV": '"production"' },
	});
	if (!result.success) throw new AggregateError(result.logs, `Plugin build failed ${source.id}`);
	const code = await result.outputs.find((file) => file.path.endsWith(".js"))?.text();
	if (!code) throw Error("No plugin script emitted");
	const content = JSON.stringify({ formatVersion: 1, manifest, code, css });
	const filename = `${source.id}.island-plugin.json`;
	await writeFile(join(output, filename), content);
	descriptors.push({
		...manifest,
		packageUrl: `https://github.com/shawn89890916/windows-dynamic-island/releases/download/plugins/${filename}`,
		sha256: sha(content),
		packageSize: Buffer.byteLength(content),
	});
	console.log(`${source.id}: code ${Buffer.byteLength(code)} B, shared styles ${Buffer.byteLength(css)} B`);
}
const index = `${JSON.stringify({ formatVersion: 1, sdkVersion: 1, version: release.version, plugins: descriptors }, null, 2)}\n`;
await writeFile(join(root, "plugins/catalog.json"), index);
console.log(`Built ${descriptors.length} independent packages`);

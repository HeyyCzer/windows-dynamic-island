import { useSyncExternalStore } from "react";
import { command, isTauri } from "../bridge";
import type { PluginManifest } from "./types";

const CACHE = "island_plugin_catalog_v1";
const CATALOG_URL = "https://raw.githubusercontent.com/shawn89890916/windows-dynamic-island/main/plugins/catalog.json";
function cached(): PluginManifest[] {
	try {
		return JSON.parse(localStorage.getItem(CACHE) || "[]");
	} catch {
		return [];
	}
}
// Metadata only. Executable plugin code is fetched separately on installation.
export let MARKETPLACE_CATALOG: PluginManifest[] = cached();
let error: string | null = null;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();
let revision = 0;
const notify = () => {
	revision += 1;
	for (const listener of listeners) listener();
};
export function refreshCatalog(): Promise<void> {
	if (pending) return pending;
	error = null;
	pending = (async () => {
		const index = isTauri
			? await command<{ formatVersion: number; plugins: PluginManifest[] }>("plugin_catalog")
			: await fetch(CATALOG_URL, { signal: AbortSignal.timeout(30000) }).then((r) => {
					if (!r.ok) throw Error(`插件目录 HTTP ${r.status}`);
					return r.json();
				});
		if (index.formatVersion !== 1 || !Array.isArray(index.plugins)) throw Error("插件目录格式无效");
		MARKETPLACE_CATALOG = index.plugins.filter(
			(p: PluginManifest) => p.id && p.sdkVersion === 1 && p.packageUrl && p.sha256,
		);
		localStorage.setItem(CACHE, JSON.stringify(MARKETPLACE_CATALOG));
	})()
		.catch((err: unknown) => {
			error = err instanceof Error ? err.message : String(err);
		})
		.finally(() => {
			pending = null;
			notify();
		});
	notify();
	return pending;
}
export function useCatalog() {
	useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => revision,
	);
	return { catalog: MARKETPLACE_CATALOG, error, loading: pending !== null, refresh: refreshCatalog };
}

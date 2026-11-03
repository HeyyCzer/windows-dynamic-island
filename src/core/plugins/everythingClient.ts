/**
 * Everything Search Client
 * Connects to Voidtools Everything embedded HTTP Server (http://127.0.0.1:8080).
 */
import { command, isTauri } from "../bridge";

export interface EverythingItem {
	type: "file" | "folder";
	name: string;
	path: string;
	size?: number;
	date_modified?: string;
}

export interface EverythingResponse {
	totalResults: number;
	results: EverythingItem[];
}

export async function queryEverything(
	query: string,
	port = 8080,
	count = 15,
	sort = "date_modified",
	ascending = false,
): Promise<{ ok: boolean; total: number; items: EverythingItem[]; error?: string }> {
	const trimmed = query.trim();

	if (isTauri) {
		try {
			const res = await command<EverythingResponse>("everything_query", {
				query: trimmed,
				port,
				count,
				sort,
				ascending,
			});
			if (res) {
				return {
					ok: true,
					total: res.totalResults ?? res.results?.length ?? 0,
					items: res.results ?? [],
				};
			}
		} catch (err) {
			console.warn("everything_query backend command failed, attempting direct HTTP fallback:", err);
		}
	}

	const tryPorts = [port];
	if (port !== 80 && !tryPorts.includes(80)) tryPorts.push(80);
	if (port !== 8080 && !tryPorts.includes(8080)) tryPorts.push(8080);

	let lastError = "";

	for (const p of tryPorts) {
		const ascParam = ascending ? "1" : "0";
		const url = `http://127.0.0.1:${p}/?search=${encodeURIComponent(trimmed)}&json=1&count=${count}&path_column=1&size_column=1&date_modified_column=1&sort=${sort}&ascending=${ascParam}`;
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 1200);
			const res = await fetch(url, { signal: controller.signal });
			clearTimeout(timeout);

			if (res.ok) {
				const data: EverythingResponse = await res.json();
				return {
					ok: true,
					total: data.totalResults ?? data.results?.length ?? 0,
					items: data.results ?? [],
				};
			}
		} catch (err) {
			lastError = err instanceof Error ? err.message : String(err);
		}
	}

	return {
		ok: false,
		total: 0,
		items: [],
		error: lastError || "无法连接到 Everything HTTP 服务",
	};
}

export function formatEverythingDate(raw?: string): string {
	if (!raw) return "--";
	try {
		if (/^\d{16,19}$/.test(raw.trim())) {
			// Windows FILETIME conversion (100ns units since 1601-01-01 UTC)
			const ft = BigInt(raw.trim());
			const ms = Number(ft / 10000n) - 11644473600000;
			const d = new Date(ms);
			if (!Number.isNaN(d.getTime())) {
				const yyyy = d.getFullYear();
				const mm = String(d.getMonth() + 1).padStart(2, "0");
				const dd = String(d.getDate()).padStart(2, "0");
				const hh = String(d.getHours()).padStart(2, "0");
				const min = String(d.getMinutes()).padStart(2, "0");
				return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
			}
		}
		if (raw.includes("-")) {
			return raw.slice(0, 16).replace("T", " ");
		}
	} catch {
		// ignore
	}
	return raw;
}

export function formatFileSize(bytes?: number): string {
	if (bytes === undefined || bytes === null || bytes < 0) return "--";
	if (bytes === 0) return "0 B";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

import { afterEach, expect, test } from "bun:test";
import { createVpnMonitor } from "./useVpn";
import { failoverNode, fastestNodes, groupNodes, selectedGroup, type VpnSnapshot, vpnConfig } from "./vpnClient";

const snapshot: VpnSnapshot = {
	mode: "rule",
	proxies: {
		Proxy: { name: "Proxy", type: "Selector", now: "A", all: ["A", "B", "C", "DIRECT"] },
		A: { name: "A", type: "Shadowsocks" },
		B: { name: "B", type: "Vmess" },
		C: { name: "C", type: "Trojan" },
		DIRECT: { name: "DIRECT", type: "Direct" },
	},
};
const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});
test("settings are bounded and candidates are explicit", () => {
	const config = vpnConfig({ testInterval: 1, timeoutMs: 999999, fallbackNodes: "B,B，C" });
	expect(config.interval).toBe(15000);
	expect(config.timeout).toBe(15000);
	expect(config.fallbackNodes).toEqual(["B", "C"]);
	expect(vpnConfig({}).interval).toBe(60000);
	expect(vpnConfig({}).autoSwitch).toBe(false);
});
test("rank successful probes and fail over only when current fails and an allowed node works", () => {
	const group = snapshot.proxies.Proxy;
	const nodes = [
		{ name: "A", delay: null },
		{ name: "B", delay: 80 },
		{ name: "C", delay: 10 },
	];
	const config = vpnConfig({ autoSwitch: true, fallbackNodes: "B" });
	expect(fastestNodes(nodes, 2).map((n) => n.name)).toEqual(["C", "B"]);
	expect(failoverNode(config, snapshot, group, nodes)).toBe("B");
	expect(failoverNode(config, { ...snapshot, mode: "direct" }, group, nodes)).toBeUndefined();
	expect(failoverNode(config, snapshot, group, [{ name: "A", delay: 200 }, ...nodes.slice(1)])).toBeUndefined();
	expect(failoverNode(vpnConfig({ autoSwitch: true }), snapshot, group, nodes)).toBeUndefined();
	expect(groupNodes(snapshot, group)).toEqual(["A", "B", "C"]);
	expect(selectedGroup(snapshot, "missing")).toBeUndefined();
});
test("overlapping refreshes share a round; stop prevents stale results and automatic writes", async () => {
	let reads = 0;
	let writes = 0;
	globalThis.fetch = (async (url: URL | RequestInfo, init?: RequestInit) => {
		const path = new URL(String(url)).pathname;
		if (init?.method === "PUT") writes++;
		if (path === "/proxies") reads++;
		await new Promise((r) => setTimeout(r, 2));
		const name = decodeURIComponent(path.split("/")[2] || "");
		const delay = name === "A" ? 35 : name === "B" ? 5 : 20;
		return Response.json(
			path === "/configs" ? { mode: "rule" } : path.endsWith("/delay") ? { delay } : { proxies: snapshot.proxies },
		);
	}) as typeof fetch;
	const monitor = createVpnMonitor(vpnConfig({}));
	monitor.start();
	const first = monitor.refresh();
	expect(monitor.refresh()).toBe(first);
	await first;
	expect(reads).toBe(1);
	expect(monitor.store.get().nodes).toHaveLength(3);
	expect(monitor.store.get().nodes.map((node) => node.name)).toEqual(["B", "C", "A"]);
	const probesBeforeConfigChange = reads;
	monitor.configure({ ...vpnConfig({}), fallbackNodes: ["B"] });
	expect(reads).toBe(probesBeforeConfigChange);
	expect(monitor.store.get().nodes).toHaveLength(3);
	expect(monitor.store.get().nextAt - Date.now()).toBeGreaterThan(59000);
	const later = monitor.refresh();
	monitor.stop();
	await later;
	expect(writes).toBe(0);
});

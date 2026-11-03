import { command, isTauri, openExternal } from "../bridge";

export type RoutingMode = "rule" | "global" | "direct";
export interface VpnConfig {
	endpoint: string;
	secret: string;
	group: string;
	interval: number;
	timeout: number;
	topCount: number;
	testUrl: string;
	autoSwitch: boolean;
	fallbackNodes: string[];
}
export interface ProxyNode {
	name: string;
	type: string;
	all?: string[];
	now?: string;
}
export interface VpnSnapshot {
	proxies: Record<string, ProxyNode>;
	mode: RoutingMode;
}
export interface NodeDelay {
	name: string;
	delay: number | null;
}
const bounded = (value: unknown, fallback: number, min: number, max: number) => {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, n)) : fallback;
};
export function vpnConfig(settings: Record<string, unknown>): VpnConfig {
	return {
		endpoint: String(settings.controllerUrl || "http://127.0.0.1:9090")
			.trim()
			.replace(/\/$/, ""),
		secret: String(settings.controllerSecret || "").trim(),
		group: String(settings.proxyGroup || "").trim(),
		interval: bounded(settings.testInterval, 60, 15, 3600) * 1000,
		timeout: bounded(settings.timeoutMs, 4000, 1000, 15000),
		topCount: bounded(settings.topCount, 5, 1, 10),
		testUrl: String(settings.testUrl || "https://www.gstatic.com/generate_204").trim(),
		autoSwitch: settings.autoSwitch === true,
		fallbackNodes: [
			...new Set(
				String(settings.fallbackNodes || "")
					.split(/[,，\r\n]/)
					.map((n) => n.trim())
					.filter(Boolean),
			),
		],
	};
}
export async function vpnRequest<T>(config: VpnConfig, action: string, name = "", value = ""): Promise<T> {
	if (isTauri)
		return command<T>("vpn_request", {
			request: {
				endpoint: config.endpoint,
				secret: config.secret,
				action,
				name,
				value,
				testUrl: config.testUrl,
				timeoutMs: config.timeout,
			},
		});
	const url = new URL(config.endpoint);
	if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !["http:", "https:"].includes(url.protocol))
		throw Error("请填写本机控制器地址");
	url.pathname =
		action === "proxies" || action === "configs" || action === "mode"
			? `/${action === "mode" ? "configs" : action}`
			: `/proxies/${encodeURIComponent(name)}${action === "delay" ? "/delay" : ""}`;
	if (action === "delay") {
		url.searchParams.set("url", config.testUrl);
		url.searchParams.set("timeout", String(config.timeout));
	}
	const abort = new AbortController();
	const timer = setTimeout(() => abort.abort(), config.timeout + 1000);
	try {
		const response = await fetch(url, {
			method: action === "select" ? "PUT" : action === "mode" ? "PATCH" : "GET",
			headers: { Authorization: `Bearer ${config.secret}`, "Content-Type": "application/json" },
			...(action === "select" || action === "mode"
				? { body: JSON.stringify(action === "select" ? { name: value } : { mode: value }) }
				: {}),
			signal: abort.signal,
		});
		if (!response.ok)
			throw Error(
				response.status === 401 || response.status === 403
					? "控制器密钥无效"
					: response.status === 504 || response.status === 408
						? "节点测速超时"
						: `控制器 HTTP ${response.status}`,
			);
		return response.status === 204 ? (null as T) : await response.json();
	} catch (err) {
		if (abort.signal.aborted) throw Error("控制器请求超时");
		throw err;
	} finally {
		clearTimeout(timer);
	}
}
export async function readVpnSnapshot(config: VpnConfig): Promise<VpnSnapshot> {
	const [nodes, settings] = await Promise.all([
		vpnRequest<{ proxies: Record<string, ProxyNode> }>(config, "proxies"),
		vpnRequest<{ mode: RoutingMode }>(config, "configs"),
	]);
	if (!nodes?.proxies || !["rule", "global", "direct"].includes(settings?.mode))
		throw Error("控制器响应无效，请填写 External Controller 地址，勿使用代理混合端口");
	return { proxies: nodes.proxies, mode: settings.mode };
}
export function selectedGroup(snapshot: VpnSnapshot, preferred: string) {
	const groups = Object.values(snapshot.proxies).filter((p) => p.type === "Selector" && Array.isArray(p.all));
	if (snapshot.mode === "global") return groups.find((g) => g.name === "GLOBAL");
	return (
		groups.find((g) => g.name === preferred) ??
		(preferred ? undefined : (groups.find((g) => g.name !== "GLOBAL") ?? groups[0]))
	);
}
export function groupNodes(snapshot: VpnSnapshot, group: ProxyNode): string[] {
	return [...new Set(group.all ?? [])].filter((name) => {
		const node = snapshot.proxies[name];
		return (
			node &&
			!node.all &&
			!["Direct", "DIRECT", "Reject", "REJECT", "RejectDrop", "Pass", "Compatible"].includes(node.type)
		);
	});
}
export function fastestNodes(nodes: NodeDelay[], count: number) {
	return nodes
		.filter((n) => n.delay !== null && n.delay > 0)
		.sort((a, b) => (a.delay ?? Infinity) - (b.delay ?? Infinity))
		.slice(0, count);
}
export function failoverNode(config: VpnConfig, snapshot: VpnSnapshot, group: ProxyNode, nodes: NodeDelay[]) {
	if (
		!config.autoSwitch ||
		snapshot.mode === "direct" ||
		!group.now ||
		!nodes.some((n) => n.name === group.now && n.delay === null)
	)
		return undefined;
	return fastestNodes(
		nodes.filter((n) => n.name !== group.now && config.fallbackNodes.includes(n.name)),
		1,
	)[0]?.name;
}
export function launchVpnApp(clientPath: string) {
	return openExternal(clientPath.includes(":") ? `file:///${clientPath.replace(/\\/g, "/")}` : clientPath);
}

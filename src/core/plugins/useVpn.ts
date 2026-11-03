import { useEffect, useMemo, useRef } from "react";
import { createStore } from "../island";
import {
	failoverNode,
	groupNodes,
	type NodeDelay,
	readVpnSnapshot,
	selectedGroup,
	type VpnConfig,
	type VpnSnapshot,
	vpnConfig,
	vpnRequest,
} from "./vpnClient";

interface VpnState {
	snapshot: VpnSnapshot | null;
	group: string;
	nodes: NodeDelay[];
	busy: boolean;
	error: string | null;
	notice: string;
	updatedAt: number;
	nextAt: number;
}
/** One owner in the island keeps monitoring even when its panel is closed. */
export function createVpnMonitor(config: VpnConfig) {
	let currentConfig = config;
	const store = createStore<VpnState>({
		snapshot: null,
		group: "",
		nodes: [],
		busy: false,
		error: null,
		notice: "",
		updatedAt: 0,
		nextAt: 0,
	});
	let active = false;
	let pending: Promise<void> | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const schedule = () => {
		if (!active) return;
		const nextAt = Date.now() + currentConfig.interval;
		store.set((s) => ({ ...s, nextAt }));
		timer = setTimeout(() => void refresh(), currentConfig.interval);
	};
	const operation = (run: () => Promise<void>) => {
		if (pending) return pending;
		clearTimeout(timer);
		store.set((s) => ({ ...s, busy: true, nextAt: 0, error: null, notice: "" }));
		pending = run()
			.catch((err: unknown) => {
				if (active) store.set((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
			})
			.finally(() => {
				pending = null;
				if (active) {
					store.set((s) => ({ ...s, busy: false }));
					schedule();
				}
			});
		return pending;
	};
	const refresh = () =>
		operation(async () => {
			let snapshot = await readVpnSnapshot(currentConfig);
			const group = selectedGroup(snapshot, currentConfig.group);
			if (!group) throw Error(currentConfig.group ? "指定策略组不存在或不能手动切换" : "没有可手动切换的策略组");
			const names = groupNodes(snapshot, group);
			if (!names.length) throw Error("该组没有直接节点，请选择包含实际节点的手动策略组");
			if (names.length > 256) throw Error("节点超过 256 个，请选择更小的策略组");
			store.set((s) => ({ ...s, snapshot, group: group.name, nodes: [], updatedAt: 0 }));
			const nodes: NodeDelay[] = [];
			let index = 0;
			const results = await Promise.allSettled(
				Array.from({ length: Math.min(4, names.length) }, async () => {
					while (active && index < names.length) {
						const name = names[index++];
						let node: NodeDelay;
						try {
							const result = await vpnRequest<{ delay: number }>(currentConfig, "delay", name);
							node = { name, delay: Number.isFinite(result?.delay) && result.delay > 0 ? result.delay : null };
						} catch (err) {
							if (String(err).includes("密钥")) throw err;
							node = { name, delay: null };
						}
						nodes.push(node);
						if (active)
							store.set((s) => ({
								...s,
								nodes: [...nodes].sort((a, b) => (a.delay ?? Infinity) - (b.delay ?? Infinity)),
								updatedAt: Date.now(),
							}));
					}
				}),
			);
			for (const result of results) if (result.status === "rejected") throw result.reason;
			if (!active) return;
			let notice = "";
			const target = failoverNode(currentConfig, snapshot, group, nodes);
			if (target) {
				const fresh = await readVpnSnapshot(currentConfig);
				const currentGroup = selectedGroup(fresh, currentConfig.group);
				if (
					active &&
					fresh.mode === snapshot.mode &&
					currentGroup?.name === group.name &&
					currentGroup.now === group.now
				) {
					await vpnRequest(currentConfig, "select", group.name, target);
					if (!active) return;
					snapshot = await readVpnSnapshot(currentConfig);
					if (snapshot.proxies[group.name]?.now !== target) throw Error("控制器未确认自动切换，当前节点状态未知");
					notice = `原节点超时或不可用，已切换至 ${target}`;
				} else snapshot = fresh;
			}
			const current = snapshot.proxies[group.name]?.now;
			const failed = nodes.some((n) => n.name === current && n.delay === null);
			if (active) {
				const sortedNodes = [...nodes].sort((a, b) => (a.delay ?? Infinity) - (b.delay ?? Infinity));
				store.set({
					snapshot,
					group: group.name,
					nodes: sortedNodes,
					busy: true,
					updatedAt: Date.now(),
					nextAt: 0,
					notice,
					error: failed ? "当前节点测速超时或不可用；未找到可用的指定候选节点" : null,
				});
			}
		});
	const change = (action: "select" | "mode", value: string) =>
		operation(async () => {
			if (!active) return;
			const state = store.get();
			if (action === "select" && !state.nodes.some((n) => n.name === value)) throw Error("节点不属于当前策略组");
			await vpnRequest(currentConfig, action, action === "select" ? state.group : "", value);
			const snapshot = await readVpnSnapshot(currentConfig);
			if (!active) return;
			if ((action === "select" ? snapshot.proxies[state.group]?.now : snapshot.mode) !== value)
				throw Error("控制器未确认切换，请刷新查看实际状态");
			store.set((s) => ({
				...s,
				snapshot,
				group: selectedGroup(snapshot, currentConfig.group)?.name ?? s.group,
				error: null,
				notice: action === "select" ? `已切换至 ${value}` : "分流模式已更新",
			}));
		});
	const changeAndRefresh = async (action: "select" | "mode", value: string) => {
		await change(action, value);
		if (active && action === "mode" && !store.get().error) await refresh();
	};
	return {
		get config() {
			return currentConfig;
		},
		store,
		refresh,
		change: changeAndRefresh,
		configure(next: VpnConfig) {
			const intervalChanged = next.interval !== currentConfig.interval;
			currentConfig = next;
			if (active && intervalChanged && !pending) {
				clearTimeout(timer);
				schedule();
			}
		},
		start() {
			active = true;
			if (!pending) void refresh();
		},
		stop() {
			active = false;
			clearTimeout(timer);
		},
	};
}
const empty = createVpnMonitor(vpnConfig({}));
let current = empty;
export function useVpnMonitor(settings?: Record<string, unknown>) {
	const configJson = settings ? JSON.stringify(vpnConfig(settings)) : "";
	const config = useMemo(() => (configJson ? (JSON.parse(configJson) as VpnConfig) : null), [configJson]);
	const identityKey = config ? JSON.stringify([config.endpoint, config.secret, config.group]) : "";
	const monitorRef = useRef({ key: "", monitor: empty });
	if (monitorRef.current.key !== identityKey) {
		monitorRef.current = { key: identityKey, monitor: config ? createVpnMonitor(config) : empty };
	}
	const monitor = monitorRef.current.monitor;
	useEffect(() => {
		if (config) monitor.configure(config);
	}, [monitor, config]);
	useEffect(() => {
		current = monitor;
		if (identityKey) monitor.start();
		return () => monitor.stop();
	}, [identityKey, monitor]);
	return monitor.store.use();
}
export function useVpn() {
	return { ...current.store.use(), config: current.config, refresh: current.refresh, change: current.change };
}

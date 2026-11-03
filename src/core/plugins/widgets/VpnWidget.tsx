import {
	CheckCircle2Icon,
	CheckIcon,
	CircleIcon,
	ExternalLinkIcon,
	RefreshCwIcon,
	ShieldCheckIcon,
	SlidersIcon,
} from "lucide-react";
import { useState } from "react";
import { Button, IconButton } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Segmented, Select } from "../../../components/ui/form";
import { Toggle } from "../../../settings/components/Toggle";
import { command } from "../../bridge";
import { useT } from "../../i18n";
import { updatePluginSettings } from "../registry";
import { useVpn } from "../useVpn";
import { fastestNodes, groupNodes, launchVpnApp } from "../vpnClient";

export function VpnWidget({ settings }: { settings: Record<string, unknown> }) {
	const vpn = useVpn();
	const t = useT();
	const [showAll, setShowAll] = useState(false);
	const current = vpn.snapshot?.proxies[vpn.group]?.now;
	const fastest = fastestNodes(vpn.nodes, vpn.config.topCount);
	const currentNode = vpn.nodes.find((n) => n.name === current);
	const visibleNodes = showAll ? [...vpn.nodes].sort((a, b) => (a.delay ?? Infinity) - (b.delay ?? Infinity)) : fastest;
	const rows =
		current && !visibleNodes.some((n) => n.name === current)
			? [{ name: current, delay: null }, ...visibleNodes]
			: visibleNodes;
	const selectedGroup = vpn.snapshot?.proxies[vpn.group];
	const totalNodes = vpn.snapshot && selectedGroup ? groupNodes(vpn.snapshot, selectedGroup).length : 0;
	const errorText = vpn.error ? localizeVpnMessage(vpn.error, t) : "";
	const noticeText = vpn.notice ? localizeVpnMessage(vpn.notice, t) : "";
	const openSettings = () => {
		localStorage.setItem("settings_navigate", "/plugins/com.island.vpn");
		void command("open_settings");
	};
	return (
		<section
			className="flex h-full flex-col gap-2.5 px-1 text-[12px] leading-[1.4]"
			aria-label={t("marketplace.widgets.vpn.title")}
		>
			<header className="flex shrink-0 items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2">
					<ShieldCheckIcon size={16} className="shrink-0 text-cyan-300" />
					<h2 className="text-[14px] font-[650]">VPN</h2>
					<span className="rounded-full bg-white/6 px-2 py-0.5 text-[10.5px] text-text-dim" role="status">
						{vpn.error
							? t("marketplace.widgets.vpn.statusError")
							: vpn.snapshot
								? t("marketplace.widgets.vpn.statusMonitoring")
								: t("marketplace.widgets.vpn.statusWaiting")}
					</span>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<Button
						onClick={() => void vpn.refresh()}
						disabled={vpn.busy}
						aria-label={t("marketplace.widgets.vpn.refresh")}
						className="h-7 gap-1.5 px-3 text-[11px]"
					>
						<RefreshCwIcon size={12} className={vpn.busy ? "animate-spin" : ""} />
						{vpn.busy ? t("marketplace.widgets.vpn.refreshing") : t("marketplace.widgets.vpn.refresh")}
					</Button>
					{Boolean(settings.clientPath) && (
						<IconButton
							size="sm"
							onClick={() => void launchVpnApp(String(settings.clientPath))}
							aria-label={t("marketplace.widgets.vpn.openClient")}
							title={t("marketplace.widgets.vpn.openClient")}
						>
							<ExternalLinkIcon size={13} />
						</IconButton>
					)}
					<IconButton
						size="sm"
						onClick={openSettings}
						aria-label={t("marketplace.widgets.vpn.settings")}
						title={t("marketplace.widgets.vpn.settings")}
					>
						<SlidersIcon size={14} />
					</IconButton>
				</div>
			</header>
			{vpn.error && (
				<p className="shrink-0 rounded-lg bg-white/4 px-2.5 py-1.5 text-[11px] text-danger" role="alert">
					{errorText}
				</p>
			)}
			{vpn.notice && (
				<p className="shrink-0 text-[11px] text-text-dim" role="status">
					{noticeText}
				</p>
			)}
			<div className="grid min-h-0 flex-1 grid-cols-[180px_minmax(0,1fr)] gap-2.5">
				<Card
					className="flex min-h-0 flex-col justify-between gap-2 px-3 py-2.5"
					aria-label={t("marketplace.widgets.vpn.currentConnection")}
				>
					<div>
						<p className="text-[10.5px] font-semibold text-text-dim">{t("marketplace.widgets.vpn.currentNode")}</p>
						<p className="mt-1 truncate text-[12px] font-semibold" title={current}>
							{current || t("marketplace.widgets.vpn.notConnected")}
						</p>
						<div className="mt-1.5 flex items-baseline gap-1.5 tabular-nums">
							<span className="text-[27px]/none font-semibold tracking-tight">{currentNode?.delay ?? "—"}</span>
							<span className="text-[11px] text-text-dim">
								{currentNode?.delay != null
									? "ms"
									: vpn.busy
										? t("marketplace.widgets.vpn.testing")
										: t("marketplace.widgets.vpn.noLatency")}
							</span>
						</div>
					</div>
					{vpn.snapshot ? (
						<>
							<div className="min-w-0 space-y-1 [&>span]:w-full">
								<label htmlFor="vpn-group" className="text-[10.5px] text-text-dim">
									{t("marketplace.widgets.vpn.proxyGroup")}
								</label>
								<Select
									id="vpn-group"
									size="sm"
									aria-label={t("marketplace.widgets.vpn.proxyGroup")}
									value={vpn.group}
									disabled={vpn.busy || vpn.snapshot.mode === "global"}
									onChange={(e) => updatePluginSettings("com.island.vpn", { proxyGroup: e.target.value })}
									className="w-full text-[11px]"
								>
									{Object.values(vpn.snapshot.proxies)
										.filter((p) => p.type === "Selector")
										.map((p) => (
											<option key={p.name} value={p.name}>
												{p.name}
											</option>
										))}
								</Select>
							</div>
							<Segmented
								options={[
									{ value: "rule", label: t("marketplace.widgets.vpn.modeRule") },
									{ value: "global", label: t("marketplace.widgets.vpn.modeGlobal") },
									{ value: "direct", label: t("marketplace.widgets.vpn.modeDirect") },
								]}
								value={vpn.snapshot.mode}
								onChange={(mode) => void vpn.change("mode", mode)}
								disabled={vpn.busy}
							/>
						</>
					) : (
						<Button onClick={openSettings} className="h-7 justify-center px-2 text-[11px]">
							{t("marketplace.widgets.vpn.configure")}
						</Button>
					)}
				</Card>
				<Card className="flex min-h-0 flex-col px-2.5 py-2" aria-label={t("marketplace.widgets.vpn.nodesTitle")}>
					<div className="flex h-6 shrink-0 items-center justify-between px-1">
						<div className="flex min-w-0 items-center gap-1.5">
							<h3 className="text-[11px] font-semibold">{t("marketplace.widgets.vpn.nodesTitle")}</h3>
							<span className="text-[10px] text-text-dim">
								{vpn.nodes.length}
								{totalNodes ? `/${totalNodes}` : ""}
							</span>
						</div>
						<div className="flex shrink-0 rounded-md bg-white/5 p-0.5 text-[9.5px]">
							<button
								type="button"
								onClick={() => setShowAll(false)}
								aria-pressed={!showAll}
								className={`rounded px-1.5 py-0.5 ${!showAll ? "bg-white/12 text-text" : "text-text-dim"}`}
							>
								{t("marketplace.widgets.vpn.fastestNodes")}
							</button>
							<button
								type="button"
								onClick={() => setShowAll(true)}
								aria-pressed={showAll}
								className={`rounded px-1.5 py-0.5 ${showAll ? "bg-white/12 text-text" : "text-text-dim"}`}
							>
								{t("marketplace.widgets.vpn.allNodes")}
							</button>
						</div>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto" data-scroll data-no-drag>
						<ul>
							{rows.map((node) => {
								const selected = node.name === current;
								const fallback = vpn.config.fallbackNodes.includes(node.name);
								return (
									<li
										key={node.name}
										className={`flex min-h-8 items-center gap-2 rounded-lg px-1 ${selected ? "bg-white/7" : "hover:bg-white/4"}`}
									>
										<button
											type="button"
											disabled={vpn.busy || selected}
											onClick={() => void vpn.change("select", node.name)}
											className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left"
											title={node.name}
											aria-label={t("marketplace.widgets.vpn.switchToNode", { name: node.name })}
										>
											{selected ? (
												<CheckIcon size={12} className="shrink-0 text-cyan-300" />
											) : (
												<span className="w-3 shrink-0 text-[10px] tabular-nums text-text-dim">
													{vpn.nodes.findIndex((n) => n.name === node.name) + 1}
												</span>
											)}
											<span className="truncate text-[11.5px]">{node.name}</span>
										</button>
										<span
											className={`shrink-0 font-mono text-[10.5px] tabular-nums ${node.delay === null ? "text-danger" : "text-text-dim"}`}
										>
											{node.delay === null ? t("marketplace.widgets.vpn.timeout") : `${node.delay} ms`}
										</span>
										<IconButton
											size="sm"
											role="checkbox"
											aria-checked={fallback}
											aria-label={t(
												fallback ? "marketplace.widgets.vpn.removeCandidate" : "marketplace.widgets.vpn.addCandidate",
												{ name: node.name },
											)}
											title={t(
												fallback ? "marketplace.widgets.vpn.removeCandidate" : "marketplace.widgets.vpn.addCandidate",
												{ name: node.name },
											)}
											onClick={() =>
												updatePluginSettings("com.island.vpn", {
													fallbackNodes: (fallback
														? vpn.config.fallbackNodes.filter((n) => n !== node.name)
														: [...vpn.config.fallbackNodes, node.name]
													).join(","),
												})
											}
										>
											{fallback ? <CheckCircle2Icon size={14} className="text-cyan-300" /> : <CircleIcon size={14} />}
										</IconButton>
									</li>
								);
							})}
						</ul>
						{!rows.length && (
							<div className="flex h-full min-h-16 items-center px-2 text-[11px]/relaxed text-text-dim">
								{vpn.busy
									? t(vpn.nodes.length ? "marketplace.widgets.vpn.testingProgress" : "marketplace.widgets.vpn.testing")
									: vpn.updatedAt
										? t("marketplace.widgets.vpn.noAvailableNodes")
										: t("marketplace.widgets.vpn.connectToShowNodes")}
							</div>
						)}
					</div>
				</Card>
			</div>
			<footer className="flex shrink-0 items-center justify-between gap-3 px-1 text-[10.5px] text-text-dim">
				<label className="flex cursor-pointer items-center gap-2">
					<Toggle
						checked={vpn.config.autoSwitch}
						onChange={(value) => updatePluginSettings("com.island.vpn", { autoSwitch: value })}
					/>
					<span>
						{t("marketplace.widgets.vpn.autoSwitch")}{" "}
						<span className="ml-1 text-text-faint">
							{t("marketplace.widgets.vpn.candidateCount", { count: vpn.config.fallbackNodes.length })}
						</span>
					</span>
				</label>
				<span className="font-mono tabular-nums">
					{vpn.busy
						? t("marketplace.widgets.vpn.testing")
						: vpn.nextAt
							? t("marketplace.widgets.vpn.nextTest", {
									time: new Date(vpn.nextAt).toLocaleTimeString([], {
										hour: "2-digit",
										minute: "2-digit",
										second: "2-digit",
									}),
								})
							: t("marketplace.widgets.vpn.interval", { seconds: vpn.config.interval / 1000 })}
				</span>
			</footer>
		</section>
	);
}

function localizeVpnMessage(message: string, t: ReturnType<typeof useT>) {
	const exact: Record<string, Parameters<typeof t>[0]> = {
		指定策略组不存在或不能手动切换: "marketplace.widgets.vpn.errorGroupUnavailable",
		没有可手动切换的策略组: "marketplace.widgets.vpn.errorNoGroup",
		"该组没有直接节点，请选择包含实际节点的手动策略组": "marketplace.widgets.vpn.errorNoNodes",
		"节点超过 256 个，请选择更小的策略组": "marketplace.widgets.vpn.errorTooManyNodes",
		"当前节点测速超时或不可用；未找到可用的指定候选节点": "marketplace.widgets.vpn.errorNoFailover",
		控制器地址无效: "marketplace.widgets.vpn.errorInvalidController",
		"请使用本机控制器地址，如 http://127.0.0.1:9090": "marketplace.widgets.vpn.errorUseLocalController",
		控制器密钥无效: "marketplace.widgets.vpn.errorInvalidSecret",
		"控制器密钥无效，请检查 Secret": "marketplace.widgets.vpn.errorInvalidSecret",
		节点测速超时: "marketplace.widgets.vpn.errorNodeTimeout",
		控制器请求超时: "marketplace.widgets.vpn.errorControllerTimeout",
		"无法连接本机控制器，请检查客户端及 External Controller 设置": "marketplace.widgets.vpn.errorControllerOffline",
		"控制器响应无效，请填写 External Controller 地址，勿使用代理混合端口":
			"marketplace.widgets.vpn.errorInvalidResponse",
		"控制器未确认自动切换，当前节点状态未知": "marketplace.widgets.vpn.errorSwitchUnconfirmed",
		节点不属于当前策略组: "marketplace.widgets.vpn.errorNodeOutsideGroup",
		"控制器未确认切换，请刷新查看实际状态": "marketplace.widgets.vpn.errorSwitchUnconfirmed",
		分流模式已更新: "marketplace.widgets.vpn.noticeModeUpdated",
	};
	const key = exact[message];
	if (key) return t(key);
	const failover = message.match(/^原节点超时或不可用，已切换至 (.+)$/);
	if (failover) return t("marketplace.widgets.vpn.noticeFailover", { name: failover[1] });
	const switched = message.match(/^已切换至 (.+)$/);
	if (switched) return t("marketplace.widgets.vpn.noticeSwitched", { name: switched[1] });
	if (/^控制器 HTTP \d+/.test(message)) return t("marketplace.widgets.vpn.errorControllerHttp");
	return message;
}

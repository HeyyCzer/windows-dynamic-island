import { AlertTriangleIcon, ArrowDownRightIcon, ArrowUpRightIcon, RefreshCwIcon, TrendingUpIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { NeedsConfigCard } from "./NeedsConfigCard";

interface LiveCryptoItem {
	symbol: string;
	pair: string;
	price: string;
	change: number;
	high24h: string;
	low24h: string;
	color: string;
	glyph: string;
}

interface BinanceTicker {
	symbol: string;
	lastPrice: string;
	priceChangePercent: string;
	highPrice: string;
	lowPrice: string;
}

const COLOR_MAP: Record<string, { color: string; glyph: string }> = {
	BTC: { color: "#F7931A", glyph: "₿" },
	ETH: { color: "#627EEA", glyph: "Ξ" },
	SOL: { color: "#14F195", glyph: "◎" },
	BNB: { color: "#F3BA2F", glyph: "BNB" },
	DOGE: { color: "#C2A633", glyph: "Ð" },
	XRP: { color: "#23292F", glyph: "✕" },
};

export function CryptoTickerWidget({ settings }: { settings: Record<string, unknown> }) {
	const isConfigured = Boolean(settings.configured && settings.symbols);
	const symbolsRaw = String(settings.symbols || "").trim();

	const [items, setItems] = useState<LiveCryptoItem[]>([]);
	const [activeSymbol, setActiveSymbol] = useState<string>("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchRealQuotes = useCallback(async () => {
		const symbolList = symbolsRaw
			.split(/[,，\s]+/)
			.map((s) => s.trim().toUpperCase())
			.filter(Boolean);

		if (!symbolList.length) return;
		setLoading(true);
		setError(null);

		try {
			// Query Binance live 24hr ticker API
			const pairs = symbolList.map((s) => `"${s}USDT"`).join(",");
			const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=[${pairs}]`);
			if (!res.ok) throw new Error("行情服务器响应异常，请检查代币代码");
			const rawList = (await res.json()) as BinanceTicker[];

			if (!Array.isArray(rawList)) {
				throw new Error("无法读取行情数据");
			}

			const parsed: LiveCryptoItem[] = rawList.map((item) => {
				const base = item.symbol.replace("USDT", "");
				const meta = COLOR_MAP[base] || { color: "#818cf8", glyph: base.slice(0, 2) };
				const lastPrice = Number.parseFloat(item.lastPrice);
				const priceChangePercent = Number.parseFloat(item.priceChangePercent);
				const highPrice = Number.parseFloat(item.highPrice);
				const lowPrice = Number.parseFloat(item.lowPrice);

				return {
					symbol: base,
					pair: `${base} / USDT`,
					price: `$${lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`,
					change: priceChangePercent,
					high24h: `$${highPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
					low24h: `$${lowPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
					color: meta.color,
					glyph: meta.glyph,
				};
			});

			setItems(parsed);
			if (parsed.length > 0 && !activeSymbol) {
				setActiveSymbol(parsed[0].symbol);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [symbolsRaw, activeSymbol]);

	useEffect(() => {
		if (isConfigured) {
			fetchRealQuotes();
			const interval = setInterval(fetchRealQuotes, 20_000);
			return () => clearInterval(interval);
		}
	}, [isConfigured, fetchRealQuotes]);

	if (!isConfigured) {
		return (
			<NeedsConfigCard
				pluginId="com.island.crypto-ticker"
				title="行情监控"
				description="未配置自选监控标的。请输入关注的代码（逗号分隔），直连行情接口实时看盘。"
				icon={<TrendingUpIcon size={18} />}
				accentColor="#66BB6A"
				settingsDefs={[
					{
						key: "symbols",
						label: "自选代币/交易对（如 BTC, ETH, SOL）",
						type: "text",
						default: "BTC, ETH",
					},
				]}
				currentSettings={settings}
			/>
		);
	}

	if (loading && items.length === 0) {
		return (
			<div className="flex h-full items-center justify-center gap-2 text-xs text-text-faint">
				<RefreshCwIcon size={14} className="animate-spin text-emerald-400" />
				<span>正在连接获取 {symbolsRaw} 实时行情...</span>
			</div>
		);
	}

	if (error && items.length === 0) {
		return (
			<div className="flex h-full items-center justify-between px-4 text-xs">
				<div className="flex items-center gap-2 text-rose-400">
					<AlertTriangleIcon size={16} />
					<span>{error}</span>
				</div>
				<button
					type="button"
					onClick={fetchRealQuotes}
					className="flex items-center gap-1 rounded-lg bg-white/8 px-2.5 py-1 text-[11px] text-text hover:bg-white/16"
				>
					<RefreshCwIcon size={11} />
					<span>重试</span>
				</button>
			</div>
		);
	}

	const current = items.find((i) => i.symbol === activeSymbol) || items[0];
	if (!current) return null;

	const isUp = current.change >= 0;

	return (
		<div className="flex h-full items-center justify-between px-3 select-none">
			{/* Leading Column: Icon, Pair Name & Real 24h Metrics */}
			<div className="flex w-[210px] shrink-0 items-center gap-3">
				<div
					className="flex size-11.5 shrink-0 items-center justify-center rounded-2xl text-white font-bold text-lg shadow-sm"
					style={{ backgroundColor: current.color }}
				>
					{current.glyph}
				</div>
				<div className="flex min-w-0 flex-col">
					<div className="flex items-center gap-1.5">
						<span className="text-[13px] font-semibold text-text truncate">{current.pair}</span>
						<span
							className={`flex items-center rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
								isUp ? "bg-emerald-500/18 text-emerald-400" : "bg-rose-500/18 text-rose-400"
							}`}
						>
							{isUp ? <ArrowUpRightIcon size={11} /> : <ArrowDownRightIcon size={11} />}
							{Math.abs(current.change).toFixed(2)}%
						</span>
					</div>
					<div className="mt-0.5 font-mono text-[22px]/[1.1] font-bold text-text tabular-nums truncate">
						{current.price}
					</div>
					<div className="flex items-center gap-2 text-[10px] text-text-faint font-mono">
						<span>高: {current.high24h}</span>
						<span>低: {current.low24h}</span>
					</div>
				</div>
			</div>

			{/* Center / Trailing: Live Quotes Ticker Switcher */}
			<div className="flex items-center gap-2 overflow-x-auto pr-1">
				{items.map((item) => {
					const itemUp = item.change >= 0;
					const isSelected = item.symbol === current.symbol;
					return (
						<button
							key={item.symbol}
							type="button"
							onClick={() => setActiveSymbol(item.symbol)}
							className={`flex flex-col items-center rounded-xl px-2.5 py-1.5 border transition-all min-w-[70px] ${
								isSelected
									? "bg-white/12 border-white/20 shadow-sm"
									: "bg-white/4 border-white/6 hover:bg-white/8 hover:border-white/10"
							}`}
						>
							<span className="text-[11px] font-bold text-text">{item.symbol}</span>
							<span className="font-mono text-[10.5px] text-text-dim tabular-nums">{item.price}</span>
							<span className={`text-[9.5px] font-semibold ${itemUp ? "text-emerald-400" : "text-rose-400"}`}>
								{itemUp ? "+" : ""}
								{item.change.toFixed(2)}%
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

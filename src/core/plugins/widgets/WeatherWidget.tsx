import {
	AlertTriangleIcon,
	CloudRainIcon,
	CloudSunIcon,
	DropletsIcon,
	RefreshCwIcon,
	SunIcon,
	ThermometerIcon,
	WindIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useT } from "../../../core/i18n";
import { NeedsConfigCard } from "./NeedsConfigCard";

interface LiveWeatherData {
	cityName: string;
	temp: number;
	feelsLike: number;
	humidity: number;
	windSpeed: number;
	condition: string;
	icon: "sun" | "cloud-sun" | "cloud-rain";
	daily: { day: string; temp: string; icon: "sun" | "cloud-sun" | "cloud-rain" }[];
}

function getWeatherCondition(code: number): { text: string; icon: "sun" | "cloud-sun" | "cloud-rain" } {
	if (code === 0) return { text: "晴朗", icon: "sun" };
	if (code <= 3) return { text: "多云", icon: "cloud-sun" };
	if (code <= 67) return { text: "阵雨", icon: "cloud-rain" };
	if (code <= 77) return { text: "降雪", icon: "cloud-rain" };
	if (code <= 82) return { text: "大雨", icon: "cloud-rain" };
	return { text: "雷阵雨", icon: "cloud-rain" };
}

export function WeatherWidget({ settings }: { settings: Record<string, unknown> }) {
	const t = useT();
	const isConfigured = Boolean(settings.configured && settings.city);
	const city = String(settings.city || "").trim();

	const [data, setData] = useState<LiveWeatherData | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchRealWeather = useCallback(async () => {
		if (!city) return;
		setLoading(true);
		setError(null);
		try {
			// 1. Geocode city name to lat/lon
			const geoRes = await fetch(
				`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`,
			);
			const geoJson = await geoRes.json();
			if (!geoJson.results || geoJson.results.length === 0) {
				throw new Error(`未找到城市 "${city}"，请检查城市拼写`);
			}
			const loc = geoJson.results[0];
			const lat = loc.latitude;
			const lon = loc.longitude;
			const displayCity = loc.name || city;

			// 2. Fetch live metrics & forecast
			const weatherRes = await fetch(
				`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`,
			);
			const wJson = await weatherRes.json();
			if (!wJson.current) throw new Error("无法读取实时天气数据");

			const cur = wJson.current;
			const cond = getWeatherCondition(cur.weather_code);

			const dailyForecast = (wJson.daily?.time || []).slice(0, 3).map((_dayStr: string, idx: number) => {
				const dayLabel = idx === 0 ? "今天" : idx === 1 ? "明天" : "后天";
				const maxT = Math.round(wJson.daily.temperature_2m_max[idx]);
				const minT = Math.round(wJson.daily.temperature_2m_min[idx]);
				const dayCond = getWeatherCondition(wJson.daily.weather_code[idx]);
				return {
					day: dayLabel,
					temp: `${maxT}°/${minT}°`,
					icon: dayCond.icon,
				};
			});

			setData({
				cityName: displayCity,
				temp: Math.round(cur.temperature_2m),
				feelsLike: Math.round(cur.apparent_temperature),
				humidity: Math.round(cur.relative_humidity_2m),
				windSpeed: Math.round(cur.wind_speed_10m),
				condition: cond.text,
				icon: cond.icon,
				daily: dailyForecast,
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [city]);

	useEffect(() => {
		if (isConfigured) {
			fetchRealWeather();
		}
	}, [isConfigured, fetchRealWeather]);

	if (!isConfigured) {
		return (
			<NeedsConfigCard
				pluginId="com.island.weather"
				title="实时天气"
				description="未配置城市。请在下方输入城市名称并保存，即可直连气象服务获取真实实时天气与预警。"
				icon={<CloudSunIcon size={18} />}
				accentColor="#00B0FF"
				settingsDefs={[
					{
						key: "city",
						label: "所在城市 (例如：Beijing / Shanghai / Tokyo / London)",
						type: "text",
						default: "Beijing",
					},
				]}
				currentSettings={settings}
			/>
		);
	}

	if (loading && !data) {
		return (
			<div className="flex h-full items-center justify-center gap-2 text-xs text-text-faint">
				<RefreshCwIcon size={14} className="animate-spin text-sky-400" />
				<span>正在连接获取 {city} 真实气象数据...</span>
			</div>
		);
	}

	if (error && !data) {
		return (
			<div className="flex h-full items-center justify-between px-4 text-xs">
				<div className="flex items-center gap-2 text-rose-400">
					<AlertTriangleIcon size={16} />
					<span>{error}</span>
				</div>
				<button
					type="button"
					onClick={fetchRealWeather}
					className="flex items-center gap-1 rounded-lg bg-white/8 px-2.5 py-1 text-[11px] text-text hover:bg-white/16"
				>
					<RefreshCwIcon size={11} />
					<span>重试</span>
				</button>
			</div>
		);
	}

	if (!data) return null;

	return (
		<div className="flex h-full items-center justify-between px-3 select-none">
			{/* Left Column: City, Real Temp & Condition */}
			<div className="flex w-[185px] shrink-0 items-center gap-3">
				<div className="flex size-11.5 shrink-0 items-center justify-center rounded-2xl bg-sky-500/18 text-sky-400">
					{data.icon === "sun" ? (
						<SunIcon size={24} className="text-amber-400" />
					) : data.icon === "cloud-sun" ? (
						<CloudSunIcon size={24} className="text-sky-400" />
					) : (
						<CloudRainIcon size={24} className="text-blue-400" />
					)}
				</div>
				<div className="flex min-w-0 flex-col">
					<div className="flex items-center gap-1.5">
						<span className="text-[13px] font-semibold text-text truncate">{data.cityName}</span>
						<span className="rounded-full bg-emerald-500/18 px-1.5 py-0.2 text-[9.5px] font-medium text-emerald-400 shrink-0 whitespace-nowrap">
							实时观测
						</span>
					</div>
					<div className="mt-0.5 flex items-baseline">
						<span className="font-mono text-[28px]/[1] font-bold text-text tabular-nums">{data.temp}</span>
						<span className="text-sm font-medium text-text-faint">°C</span>
					</div>
					<span className="text-[11px] text-text-faint truncate">{data.condition}</span>
				</div>
			</div>

			{/* Center Column: Clear Meteorological Metrics */}
			<div className="flex w-[140px] shrink-0 flex-col gap-1.5 border-x border-white/8 px-3.5 text-xs text-text-faint">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-1.5 text-text-muted">
						<ThermometerIcon size={12} className="text-amber-400 shrink-0" />
						<span className="text-[11px] whitespace-nowrap">{t("marketplace.widgets.weather.feelsLike")}</span>
					</div>
					<span className="font-mono text-[11px] font-semibold text-text tabular-nums">{data.feelsLike}°C</span>
				</div>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-1.5 text-text-muted">
						<DropletsIcon size={12} className="text-sky-400 shrink-0" />
						<span className="text-[11px] whitespace-nowrap">{t("marketplace.widgets.weather.humidity")}</span>
					</div>
					<span className="font-mono text-[11px] font-semibold text-text tabular-nums">{data.humidity}%</span>
				</div>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-1.5 text-text-muted">
						<WindIcon size={12} className="text-emerald-400 shrink-0" />
						<span className="text-[11px] whitespace-nowrap">{t("marketplace.widgets.weather.wind")}</span>
					</div>
					<span className="font-mono text-[11px] font-medium text-text tabular-nums">{data.windSpeed} km/h</span>
				</div>
			</div>

			{/* Right Column: 3-Day Forecast Cards */}
			<div className="flex shrink-0 items-center gap-2">
				{data.daily.map((f) => (
					<div
						key={f.day}
						className="flex flex-col items-center rounded-xl bg-white/4 border border-white/6 px-2.5 py-1.5 text-center min-w-[58px]"
					>
						<span className="text-[10px] text-text-faint whitespace-nowrap">{f.day}</span>
						<div className="my-1">
							{f.icon === "sun" ? (
								<SunIcon size={14} className="text-amber-400" />
							) : f.icon === "cloud-sun" ? (
								<CloudSunIcon size={14} className="text-sky-400" />
							) : (
								<CloudRainIcon size={14} className="text-blue-400" />
							)}
						</div>
						<span className="font-mono text-[10.5px] font-bold text-text tabular-nums whitespace-nowrap">{f.temp}</span>
					</div>
				))}
			</div>
		</div>
	);
}

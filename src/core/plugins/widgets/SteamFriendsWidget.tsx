import { CircleIcon, ExternalLinkIcon, Gamepad2Icon, MessageSquareIcon, RefreshCwIcon } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { openExternal } from "../../../core/bridge";
import { NeedsConfigCard } from "./NeedsConfigCard";

interface SteamFriend {
	id: string;
	name: string;
	game?: string;
	status: "in-game" | "online" | "away";
}

interface RawPlayer {
	steamid: string;
	personaname?: string;
	gameextrainfo?: string;
	personastate: number;
}

export function SteamFriendsWidget({ settings }: { settings: Record<string, unknown> }) {
	const isConfigured = Boolean(settings.configured && settings.steamApiKey && settings.steamId64);
	const apiKey = String(settings.steamApiKey || "").trim();
	const steamId = String(settings.steamId64 || "").trim();

	const [friends, setFriends] = useState<SteamFriend[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchSteamFriends = useCallback(async () => {
		if (!apiKey || !steamId) return;
		setLoading(true);
		setError(null);

		try {
			// Query Steam Web API: GetFriendList then GetPlayerSummaries
			const friendListRes = await fetch(
				`https://api.steampowered.com/ISteamUser/GetFriendList/v0001/?key=${apiKey}&steamid=${steamId}&relationship=friend`,
			);
			if (!friendListRes.ok) throw new Error("无法连接 Steam Web API，请检查 Key 与 ID");
			const friendJson = await friendListRes.json();
			const rawFriends = (friendJson.friendslist?.friends || []) as { steamid: string }[];
			if (!rawFriends.length) {
				setFriends([]);
				return;
			}

			const ids = rawFriends
				.slice(0, 16)
				.map((f) => f.steamid)
				.join(",");
			const summariesRes = await fetch(
				`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${ids}`,
			);
			const summariesJson = await summariesRes.json();
			const players = (summariesJson.response?.players || []) as RawPlayer[];

			const parsed: SteamFriend[] = players
				.map((p) => ({
					id: p.steamid,
					name: p.personaname || "Steam 好友",
					game: p.gameextrainfo,
					status: (p.gameextrainfo ? "in-game" : p.personastate > 0 ? "online" : "away") as SteamFriend["status"],
				}))
				.sort((a, b) => (b.game ? 1 : 0) - (a.game ? 1 : 0));

			setFriends(parsed);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [apiKey, steamId]);

	useEffect(() => {
		if (isConfigured) {
			fetchSteamFriends();
		}
	}, [isConfigured, fetchSteamFriends]);

	if (!isConfigured) {
		return (
			<NeedsConfigCard
				pluginId="com.island.steam-friends"
				title="Steam 动态"
				description="未配置 Steam 凭证。请输入 Steam Web API Key 与 17 位 SteamID64，以同步好友在玩与在线动态。"
				icon={<Gamepad2Icon size={18} />}
				accentColor="#AB47BC"
				externalUrl="https://steamcommunity.com/dev/apikey"
				externalLabel="获取 API Key"
				settingsDefs={[
					{
						key: "steamApiKey",
						label: "Steam Web API Key",
						type: "password",
						default: "",
					},
					{
						key: "steamId64",
						label: "SteamID64 (例如 76561198...)",
						type: "text",
						default: "",
					},
				]}
				currentSettings={settings}
			/>
		);
	}

	const playingFriends = friends.filter((f) => f.status === "in-game");

	return (
		<div className="flex h-full flex-col justify-center gap-2 px-1 select-none">
			{/* Top Bar: Header Summary & Quick Action */}
			<div className="flex items-center justify-between border-b border-white/8 pb-1.5">
				<div className="flex items-center gap-3 min-w-0">
					<div className="flex size-9 flex-none items-center justify-center rounded-2xl bg-purple-500/18 text-purple-400">
						<Gamepad2Icon size={18} />
					</div>
					<div className="min-w-0">
						<div className="flex items-center gap-2 flex-wrap">
							<span className="text-[13px] font-semibold text-text whitespace-nowrap">Steam 动态</span>
							<span className="rounded-full bg-emerald-500/18 px-2 py-0.2 text-[10px] font-medium text-emerald-400 whitespace-nowrap">
								{playingFriends.length} 人在玩
							</span>
						</div>
						<p className="text-[11px] text-text-faint whitespace-nowrap">共 {friends.length} 位在线好友</p>
					</div>
				</div>

				<div className="flex items-center gap-2 ml-3">
					<button
						type="button"
						onClick={fetchSteamFriends}
						disabled={loading}
						className="flex size-7.5 items-center justify-center rounded-full bg-white/6 text-text-faint hover:bg-white/12 hover:text-text transition-colors"
						title="刷新好友动态"
					>
						<RefreshCwIcon size={12} className={loading ? "animate-spin text-purple-400" : ""} />
					</button>

					<motion.button
						type="button"
						whileHover={{ scale: 1.05 }}
						whileTap={{ scale: 0.92 }}
						onClick={(e) => {
							e.stopPropagation();
							openExternal("steam://open/friends");
						}}
						className="flex h-7.5 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-semibold text-text transition-colors hover:bg-white/18"
					>
						<span>打开 Steam</span>
						<ExternalLinkIcon size={11} className="opacity-60" />
					</motion.button>
				</div>
			</div>

			{/* Friends Cards or Real Empty State */}
			{friends.length === 0 ? (
				<div className="flex items-center justify-center py-4 text-xs text-text-faint">
					{loading ? "正在同步 Steam 好友..." : error ? error : "暂无好友在玩游戏"}
				</div>
			) : (
				<div className="grid grid-cols-2 gap-2 max-h-[105px] overflow-y-auto pr-0.5">
					{friends.map((f) => (
						<div
							key={f.id}
							className="flex flex-col justify-between rounded-xl border border-white/6 bg-white/4 p-2 transition-colors hover:border-white/15"
						>
							<div className="flex items-center justify-between gap-1.5">
								<div className="flex items-center gap-2 min-w-0">
									<div className="relative shrink-0">
										<div className="flex size-6 items-center justify-center rounded-lg bg-purple-500/20 text-[10px] font-bold text-text">
											{f.name.slice(0, 1)}
										</div>
										<CircleIcon
											size={6}
											className={`absolute -right-0.5 -bottom-0.5 ${
												f.game ? "fill-emerald-400 text-emerald-400" : "fill-sky-400 text-sky-400"
											}`}
										/>
									</div>
									<span className="truncate text-[11.5px] font-semibold text-text">{f.name}</span>
								</div>

								<button
									type="button"
									title="发起聊天"
									onClick={(e) => {
										e.stopPropagation();
										openExternal(`steam://friends/message/${f.id}`);
									}}
									className="rounded-full p-1 text-text-faint hover:text-text"
								>
									<MessageSquareIcon size={11} />
								</button>
							</div>

							<div className="mt-1 flex items-center">
								<span className="truncate rounded px-1.5 py-0.2 text-[10px] font-medium bg-emerald-500/12 text-emerald-400">
									{f.game ? `正在玩 ${f.game}` : "在线"}
								</span>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

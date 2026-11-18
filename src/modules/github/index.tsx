/**
 * GitHub module — open issues and pull requests, newest commit and release of
 * followed repositories, as a side bubble next to the island and a tab with one
 * list per kind. Backend counterpart: `src-tauri/src/providers/github/`.
 */
import { GitHubIcon } from "../../components/icons";
import { useProvider } from "../../core/bridge";
import { useSetting, useSettings } from "../../core/settings";
import type { IslandModule, ModuleView } from "../../core/types";
import { useNow } from "../ai-agents/common/format";
import { GithubBubble } from "./components/GithubBubble";
import { GithubPanel } from "./components/GithubPanel";
import { GithubSettings } from "./components/GithubSettings";
import { freshNews } from "./repo";
import { githubSettings } from "./settings";
import type { GithubState } from "./types";

const ROW = 42;
const MAX_VISIBLE_ROWS = 5;

export const githubModule: IslandModule = {
	id: "github",
	title: "github.title",
	settingsIcon: <GitHubIcon size={15} />,
	settings: Object.values(githubSettings),
	SettingsSection: GithubSettings,
	useView(): ModuleView {
		const state = useProvider<GithubState>("github");
		const settings = useSettings();
		const showBubble = useSetting(githubSettings.showBubble);
		const now = useNow(60_000, !!state?.news.length);

		const repos = state?.repos ?? [];
		const total = repos.reduce((n, r) => n + (r.issues?.count ?? 0), 0);
		const loaded = repos.some((r) => r.issues != null);
		const rows = Math.min(Math.max(repos.length, 1), MAX_VISIBLE_ROWS);
		const news = freshNews(state, now, settings);
		const newest = news[0];

		return {
			active: false,
			priority: 0,
			icon: <GitHubIcon size={16} />,
			ambient: showBubble && loaded ? <GithubBubble count={total} fresh={!!newest} /> : undefined,
			expanded: <GithubPanel state={state} news={news} />,
			expandedSize: { width: 560, height: 70 + rows * ROW },
			activityKey: newest ? `${newest.kind}:${newest.repo}:${newest.item.id}` : undefined,
		};
	},
};

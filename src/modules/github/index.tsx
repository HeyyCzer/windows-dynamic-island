/**
 * GitHub module — open issue counts for followed repositories, as a side
 * bubble next to the island and a tab listing each repo. Backend counterpart:
 * `src-tauri/src/providers/github/`.
 */
import { GitHubIcon } from "../../components/icons";
import { useProvider } from "../../core/bridge";
import { useSetting } from "../../core/settings";
import type { IslandModule, ModuleView } from "../../core/types";
import { useNow } from "../ai-agents/common/format";
import { GithubBubble } from "./components/GithubBubble";
import { GithubPanel } from "./components/GithubPanel";
import { GithubSettings } from "./components/GithubSettings";
import { freshIssue } from "./repo";
import { githubSettings } from "./settings";
import type { GithubState } from "./types";
import "./github.css";

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
    const showBubble = useSetting(githubSettings.showBubble);
    const peekOnNew = useSetting(githubSettings.peekOnNew);
    const now = useNow(60_000, !!state?.newIssue);

    const repos = state?.repos ?? [];
    const total = repos.reduce((n, r) => n + (r.openIssues ?? 0), 0);
    const loaded = repos.some((r) => r.openIssues != null);
    const rows = Math.min(Math.max(repos.length, 1), MAX_VISIBLE_ROWS);

    return {
      active: false,
      priority: 0,
      icon: <GitHubIcon size={16} />,
      ambient: showBubble && loaded ? <GithubBubble count={total} fresh={!!freshIssue(state, now)} /> : undefined,
      expanded: <GithubPanel state={state} />,
      expandedSize: { width: 560, height: 70 + rows * ROW },
      activityKey:
        peekOnNew && state?.newIssue ? `${state.newIssue.repo}#${state.newIssue.issue.number}` : undefined,
    };
  },
};

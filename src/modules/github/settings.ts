import type { SettingDef } from "../../core/settings";
import type { GithubNewItem } from "./types";

export const githubSettings = {
	showBubble: {
		key: "github.showBubble",
		label: "github.showBubble.label",
		description: "github.showBubble.desc",
		default: true,
	},
	// Key predates PRs and releases: keeps the user's old "expand on new issue" choice.
	notifyIssues: {
		key: "github.peekOnNew",
		label: "github.notify.issues.label",
		description: "github.notify.issues.desc",
		default: true,
	},
	notifyPulls: {
		key: "github.notify.pulls",
		label: "github.notify.pulls.label",
		description: "github.notify.pulls.desc",
		default: true,
	},
	notifyReleases: {
		key: "github.notify.releases",
		label: "github.notify.releases.label",
		description: "github.notify.releases.desc",
		default: true,
	},
} satisfies Record<string, SettingDef>;

export const notifySettings: Record<GithubNewItem["kind"], SettingDef<boolean>> = {
	issues: githubSettings.notifyIssues,
	pulls: githubSettings.notifyPulls,
	releases: githubSettings.notifyReleases,
};

/** Followed repositories (`owner/name`); also read by the backend provider. */
export const githubRepos: SettingDef<string[]> = {
	key: "github.repos",
	label: "github.repos.title",
	default: [],
};

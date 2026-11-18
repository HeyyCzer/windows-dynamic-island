import { readSetting, type Values } from "../../core/settings";
import { notifySettings } from "./settings";
import type { GithubKind, GithubNewItem, GithubState } from "./types";

/** `https://github.com/o/r/issues`, `git@github.com:o/r.git` or `o/r` → `o/r`. */
export function parseRepo(input: string): string | null {
	const s = input
		.trim()
		.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
		.replace(/^git@github\.com:/i, "");
	const m = /^([\w.-]+)\/([\w.-]+?)(\.git)?(?:[/?#].*)?$/.exec(s);
	return m ? `${m[1]}/${m[2]}` : null;
}

/** A new item keeps its highlight for this long. */
export const NEW_ITEM_MS = 15 * 60_000;

/** Fresh arrivals of the kinds the user wants to hear about, newest first. */
export function freshNews(state: GithubState | undefined, now: number, settings: Values): GithubNewItem[] {
	return (state?.news ?? [])
		.filter((n) => now - n.seenAt < NEW_ITEM_MS && readSetting(settings, notifySettings[n.kind]))
		.sort((a, b) => b.seenAt - a.seenAt);
}

/** Page of a repo's list on github.com. */
export const listUrl = (repo: string, kind: GithubKind) => `https://github.com/${repo}/${kind}`;

export const formatCount = (n: number) => (n > 99 ? "99+" : String(n));

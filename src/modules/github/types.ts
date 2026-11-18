/** Mirrors `src-tauri/src/providers/github/mod.rs`. */

/** The lists the panel switches between. */
export type GithubKind = "issues" | "pulls" | "commits" | "releases";

/** An issue, pull request, commit or release. */
export interface GithubEntry {
	/** `#128`, a short sha or a release tag. */
	id: string;
	title: string;
	url: string;
	author: string | null;
	/** ISO 8601. */
	at: string;
}

export interface GithubSection {
	/** Open issues / pull requests; `null` for commits and releases. */
	count: number | null;
	latest: GithubEntry | null;
}

export type GithubErrorCode = "notFound" | "unauthorized" | "rateLimited" | "network" | "http";

export interface GithubRepo {
	/** `owner/name`. */
	name: string;
	/** `null` until first fetched. */
	issues: GithubSection | null;
	pulls: GithubSection | null;
	commits: GithubSection | null;
	releases: GithubSection | null;
	error: GithubErrorCode | null;
}

/** Something that appeared since the previous poll (never a commit). */
export interface GithubNewItem {
	kind: Exclude<GithubKind, "commits">;
	repo: string;
	item: GithubEntry;
	seenAt: number;
}

export interface GithubState {
	repos: GithubRepo[];
	auth: "none" | "token" | "gh";
	login: string | null;
	/** The saved token was rejected. */
	authError: boolean;
	rateLimitedUntil: number | null;
	loading: boolean;
	updatedAt: number | null;
	/** Newest arrival per kind. */
	news: GithubNewItem[];
}

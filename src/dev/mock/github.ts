import { defineMock, provider } from "./kit";

const REPO = "HeyyCzer/windows-island";
const HOUR = 3_600_000;

type Entry = { id: string; title: string; url: string; author: string | null; at: string };
type Section = { count: number | null; latest: Entry | null };
type Kind = "issues" | "pulls" | "releases";

const entry = (id: string, title: string, url: string, ago = HOUR): Entry => ({
	id,
	title,
	url,
	author: "octocat",
	at: new Date(Date.now() - ago).toISOString(),
});
const numbered = (repo: string, path: string, n: number, title: string, ago?: number) =>
	entry(`#${n}`, title, `https://github.com/${repo}/${path}/${n}`, ago);
const commit = (repo: string, sha: string, title: string, ago?: number) =>
	entry(sha.slice(0, 7), title, `https://github.com/${repo}/commit/${sha}`, ago);
const release = (repo: string, tag: string, title: string, ago?: number) =>
	entry(tag, title, `https://github.com/${repo}/releases/tag/${tag}`, ago);

const newest = numbered(REPO, "issues", 128, "Island flickers when switching monitors");
const state = provider("github", {
	repos: [
		{
			name: REPO,
			issues: { count: 7, latest: newest },
			pulls: { count: 2, latest: numbered(REPO, "pull", 127, "✨ added GitHub tabs", 2 * HOUR) },
			commits: { count: null, latest: commit(REPO, "e55c887a1b2c", "Merge pull request #70", 20 * 60_000) },
			releases: { count: null, latest: release(REPO, "v0.5.0", "v0.5.0", 5 * 24 * HOUR) },
			error: null,
		},
		{
			name: "tauri-apps/tauri",
			issues: { count: 1284, latest: numbered("tauri-apps/tauri", "issues", 14210, "[bug] Webview2 crash on resume") },
			pulls: { count: 143, latest: numbered("tauri-apps/tauri", "pull", 14211, "fix(windows): resize flicker") },
			commits: { count: null, latest: commit("tauri-apps/tauri", "9f8e7d6c5b4a", "chore(deps): bump wry", 3 * HOUR) },
			releases: { count: null, latest: release("tauri-apps/tauri", "tauri-v2.12.5", "tauri v2.12.5", 9 * 24 * HOUR) },
			error: null,
		},
		{ name: "someone/private-thing", issues: null, pulls: null, commits: null, releases: null, error: "notFound" },
	] as {
		name: string;
		issues: Section | null;
		pulls: Section | null;
		commits: Section | null;
		releases: Section | null;
		error: string | null;
	}[],
	auth: "gh",
	login: "octocat",
	authError: false,
	rateLimitedUntil: null as number | null,
	loading: false,
	updatedAt: Date.now() - 90_000,
	news: [{ kind: "issues", repo: REPO, item: newest, seenAt: Date.now() }] as {
		kind: Kind;
		repo: string;
		item: Entry;
		seenAt: number;
	}[],
});

let next = 129;

function arrive(kind: Kind) {
	const n = next++;
	const item =
		kind === "issues"
			? numbered(REPO, "issues", n, "Codex icon does not open the app", 0)
			: kind === "pulls"
				? numbered(REPO, "pull", n, "🐛 fixed bubble position", 0)
				: release(REPO, `v0.${n - 123}.0`, `v0.${n - 123}.0`, 0);
	state.set((s) => ({
		...s,
		repos: s.repos.map((r) => {
			if (r.name !== REPO) return r;
			const prev = r[kind];
			return { ...r, [kind]: { count: prev?.count == null ? null : prev.count + 1, latest: item } };
		}),
		news: [...s.news.filter((x) => x.kind !== kind), { kind, repo: REPO, item, seenAt: Date.now() }],
		updatedAt: Date.now(),
	}));
}

export const github = defineMock({
	label: "GitHub",
	start: () => state.publish(),
	controls: [
		{ kind: "button", label: "New issue", run: () => arrive("issues") },
		{ kind: "button", label: "New PR", run: () => arrive("pulls") },
		{ kind: "button", label: "New release", run: () => arrive("releases") },
		{
			kind: "toggle",
			label: "Auth error",
			value: () => state.get().authError,
			set: (authError) => state.set((s) => ({ ...s, authError })),
		},
		{
			kind: "toggle",
			label: "Rate limited",
			value: () => state.get().rateLimitedUntil !== null,
			set: (on) => state.set((s) => ({ ...s, rateLimitedUntil: on ? Date.now() + 15 * 60_000 : null })),
		},
	],
	actions: {
		github: { refresh: () => state.set((s) => ({ ...s, updatedAt: Date.now() })) },
	},
});

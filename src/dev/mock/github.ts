import { defineMock, provider } from "./kit";

const REPO = "HeyyCzer/windows-island";

const issue = (number: number, title: string, repo: string, createdAt = Date.now() - 3_600_000) => ({
	number,
	title,
	url: `https://github.com/${repo}/issues/${number}`,
	author: "octocat",
	createdAt: new Date(createdAt).toISOString(),
});

const newest = issue(128, "Island flickers when switching monitors", REPO);
const state = provider("github", {
	repos: [
		{ name: REPO, openIssues: 7, latest: newest, error: null },
		{
			name: "tauri-apps/tauri",
			openIssues: 1284,
			latest: issue(14210, "[bug] Webview2 crash on resume", "tauri-apps/tauri"),
			error: null,
		},
		{ name: "someone/private-thing", openIssues: null as number | null, latest: null, error: "notFound" },
	] as { name: string; openIssues: number | null; latest: ReturnType<typeof issue> | null; error: string | null }[],
	auth: "gh",
	login: "octocat",
	authError: false,
	rateLimitedUntil: null as number | null,
	loading: false,
	updatedAt: Date.now() - 90_000,
	newIssue: { repo: REPO, issue: newest, seenAt: Date.now() } as object | null,
});

let nextNumber = 129;

function openIssue() {
	const fresh = issue(nextNumber++, "Codex icon does not open the app", REPO, Date.now());
	state.set((s) => ({
		...s,
		repos: s.repos.map((r) => (r.name === REPO ? { ...r, openIssues: (r.openIssues ?? 0) + 1, latest: fresh } : r)),
		newIssue: { repo: REPO, issue: fresh, seenAt: Date.now() },
		updatedAt: Date.now(),
	}));
}

export const github = defineMock({
	label: "GitHub",
	start: () => state.publish(),
	controls: [
		{ kind: "button", label: "New issue", run: openIssue },
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

import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { GithubRepo, GithubState } from "../types";

// The real translations load through Vite (`import.meta.glob`); the keys are enough here.
mock.module("../../../core/i18n", () => ({ useT: () => (key: string) => key }));
const { GithubPanel } = await import("./GithubPanel");

const repo = (name: string): GithubRepo => ({ name, openIssues: 1, latest: null, error: null });

describe("GithubPanel", () => {
	// The island turns the mouse wheel into tab switching unless the pointer is
	// over a `[data-scroll]` element (`useWheelTabs`). The repo list wasn't one,
	// so with more repos than fit, the wheel switched tabs and the rest of the
	// list could never be reached.
	test("the repo list scrolls with the wheel", () => {
		const state = {
			repos: Array.from({ length: 12 }, (_, i) => repo(`owner/repo-${i}`)),
			auth: "none",
			login: null,
			authError: false,
			rateLimitedUntil: null,
			loading: false,
			updatedAt: null,
			newIssue: null,
		} satisfies GithubState;
		const html = renderToStaticMarkup(<GithubPanel state={state} />);
		const list = html.match(/<div[^>]*overflow-y-auto[^>]*>/)?.[0] ?? "";
		expect(list).toContain("data-scroll");
		expect(list).toContain("flex-1");
	});
});

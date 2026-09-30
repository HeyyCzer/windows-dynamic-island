/** Mirrors `src-tauri/src/providers/github/mod.rs`. */
export interface GithubIssue {
  number: number;
  title: string;
  url: string;
  author: string | null;
  /** ISO 8601. */
  createdAt: string;
}

export type GithubErrorCode = "notFound" | "unauthorized" | "rateLimited" | "network" | "http";

export interface GithubRepo {
  /** `owner/name`. */
  name: string;
  openIssues: number | null;
  latest: GithubIssue | null;
  error: GithubErrorCode | null;
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
  /** Issue that appeared since the previous poll. */
  newIssue: { repo: string; issue: GithubIssue; seenAt: number } | null;
}

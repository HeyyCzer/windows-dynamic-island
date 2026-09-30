import type { GithubState } from "./types";

/** `https://github.com/o/r/issues`, `git@github.com:o/r.git` or `o/r` → `o/r`. */
export function parseRepo(input: string): string | null {
  const s = input
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
    .replace(/^git@github\.com:/i, "");
  const m = /^([\w.-]+)\/([\w.-]+?)(\.git)?(?:[/?#].*)?$/.exec(s);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** A new issue keeps its highlight for this long. */
export const NEW_ISSUE_MS = 15 * 60_000;

export function freshIssue(state: GithubState | undefined, now: number) {
  const n = state?.newIssue;
  return n && now - n.seenAt < NEW_ISSUE_MS ? n : null;
}

export const formatCount = (n: number) => (n > 99 ? "99+" : String(n));

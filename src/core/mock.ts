/** Fake provider feed for designing the UI in a regular browser. */
import { emitLocal, publishLocal } from "./bridge";

const art =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ff6a3d'/><stop offset='1' stop-color='#7b2ff7'/></linearGradient></defs><rect width='120' height='120' fill='url(#g)'/><circle cx='60' cy='60' r='26' fill='rgba(0,0,0,.35)'/></svg>`,
  );

export function startMock() {
  const start = Date.now();
  let playing = true;

  const publish = () =>
    publishLocal("music", {
      available: true,
      playing,
      title: "Midnight City (Extended Version)",
      artist: "M83",
      album: "Hurry Up, We're Dreaming",
      appId: "Spotify.exe",
      appName: "Spotify",
      positionMs: ((Date.now() - start) % 240_000) + 30_000,
      positionAt: Date.now(),
      durationMs: 283_000,
      thumbnail: art,
      canNext: true,
      canPrevious: true,
    });

  publish();
  setInterval(publish, 1000);
  publishClaude(start);
  publishGithub(start);
  setInterval(() => {
    if (playing) emitLocal("music://level", 0.25 + Math.random() * 0.6);
  }, 33);

  // Space toggles playback in the mock to preview state changes.
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      playing = !playing;
      publish();
    }
  });
}

function publishClaude(now: number) {
  const sec = (s: number) => Math.floor((now + s * 1000) / 1000);
  publishLocal("claude", {
    sessions: [
      {
        id: "a",
        project: "dynamic-island",
        cwd: "~/projects/dynamic-island",
        status: "working",
        activity: { kind: "edit", arg: "Island.tsx" },
        tool: "Edit",
        turnStartedAt: now - 84_000,
        finishedAt: null,
        lastEventAt: now,
        model: "Opus",
        contextPct: 42,
        source: "hooks",
      },
      {
        id: "b",
        project: "api-server",
        cwd: "~/projects/api-server",
        status: "waiting",
        activity: { kind: "run", arg: "bun test", permission: true },
        tool: "Bash",
        turnStartedAt: now - 310_000,
        finishedAt: null,
        lastEventAt: now - 20_000,
        model: "Sonnet",
        contextPct: 18,
        source: "hooks",
      },
      {
        id: "c",
        project: "landing-page",
        cwd: "~/projects/landing-page",
        status: "done",
        activity: null,
        tool: null,
        turnStartedAt: now - 900_000,
        finishedAt: now - 600_000,
        lastEventAt: now - 600_000,
        model: "Opus",
        contextPct: 67,
        source: "transcript",
      },
    ],
    limits: {
      fiveHour: { usedPct: 38, resetsAt: sec(2 * 3600 + 14 * 60) },
      sevenDay: { usedPct: 61, resetsAt: sec(3 * 86400) },
      updatedAt: now,
    },
    model: "Opus",
    tokensToday: { input: 184_000, output: 92_500, cacheRead: 4_200_000, cacheWrite: 310_000, messages: 146 },
    integration: { hooks: true, statusline: true, serverOk: true },
  });
}

function publishGithub(now: number) {
  const issue = (number: number, title: string, repo: string) => ({
    number,
    title,
    url: `https://github.com/${repo}/issues/${number}`,
    author: "octocat",
    createdAt: new Date(now - 3_600_000).toISOString(),
  });
  const newest = issue(128, "Island flickers when switching monitors", "HeyyCzer/windows-dynamic-island");
  publishLocal("github", {
    repos: [
      { name: "HeyyCzer/windows-dynamic-island", openIssues: 7, latest: newest, error: null },
      { name: "tauri-apps/tauri", openIssues: 1284, latest: issue(14210, "[bug] Webview2 crash on resume", "tauri-apps/tauri"), error: null },
      { name: "someone/private-thing", openIssues: null, latest: null, error: "notFound" },
    ],
    auth: "gh",
    login: "octocat",
    authError: false,
    rateLimitedUntil: null,
    loading: false,
    updatedAt: now - 90_000,
    newIssue: { repo: "HeyyCzer/windows-dynamic-island", issue: newest, seenAt: now },
  });
}

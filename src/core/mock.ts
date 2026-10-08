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
			youtubeId: null,
		});

	publish();
	setInterval(publish, 1000);
	publishClaude(start);
	publishGithub(start);
	publishWindowsIsland(start);
	publishClipboard(start);
	publishMonitor();
	publishCalendar(start);
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

	const claudeBase = {
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
				summary: null,
				prompt: "Add a launcher grid with every module to the tab bar",
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
				summary: null,
				prompt: "Fix the flaky auth tests",
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
				summary: "Done: the hero now stacks on small screens and the CTA stays visible.",
				prompt: "Make the hero section responsive",
			},
		],
		limits: {
			fiveHour: { usedPct: 38, resetsAt: sec(2 * 3600 + 14 * 60) },
			sevenDay: { usedPct: 61, resetsAt: sec(3 * 86400) },
			updatedAt: now,
		},
		limitsResetAt: null,
		model: "Opus",
		tokensToday: { input: 184_000, output: 92_500, cacheRead: 4_200_000, cacheWrite: 310_000, messages: 146 },
		usage: {
			daily: [5.1, 8.4, 2.2, 0, 11.9, 6.3, 4.6].map((m, i) => ({
				date: new Date(now - (6 - i) * 86_400_000).toISOString().slice(0, 10),
				tokens: Math.round(m * 1_000_000),
				responses: Math.round(m * 9),
			})),
			last5hTokens: 2_300_000,
		},
		integration: { hooks: true, statusline: true, serverOk: true },
	};
	publishLocal("claude", claudeBase);

	// Emulate the backend rolling the 5h window over after 10s, then clearing the flag.
	const reset = {
		...claudeBase,
		limits: { ...claudeBase.limits, fiveHour: { usedPct: 0, resetsAt: null }, updatedAt: now + 10_000 },
	};
	setTimeout(() => publishLocal("claude", { ...reset, limitsResetAt: Date.now() }), 10_000);
	setTimeout(() => publishLocal("claude", reset), 16_000);
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

function publishCalendar(now: number) {
	const day = (offset: number, h = 0, m = 0) => {
		const d = new Date(now);
		return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, h, m).getTime();
	};
	const work = "google:me@example.com";
	const family = "google:family";
	const holidays = "ics:4f2a91";
	const ev = (id: string, calendar: string, title: string, start: number, end: number, extra: object = {}) => ({
		id,
		calendar,
		title,
		start,
		end,
		allDay: false,
		location: null,
		meetingUrl: null,
		url: "https://calendar.google.com/",
		...extra,
	});
	// Starts in 8 minutes: shows the reminder pill right away.
	const soon = Math.ceil((now + 8 * 60_000) / 60_000) * 60_000;
	publishLocal("calendar", {
		google: { builtinClient: true, hasClient: true, connected: true, account: "me@example.com", error: null },
		feeds: [{ id: "4f2a91", host: "calendar.google.com", name: "Feriados no Brasil", error: null }],
		calendars: [
			{ key: work, name: "me@example.com", color: "#039BE5", source: "google", defaultVisible: true, visible: true, error: null },
			{ key: family, name: "Família", color: "#33B679", source: "google", defaultVisible: true, visible: true, error: null },
			{ key: holidays, name: "Feriados no Brasil", color: "#FF9F0A", source: "ics", defaultVisible: true, visible: true, error: null },
		],
		events: [
			ev("a", work, "Daily stand-up", soon, soon + 15 * 60_000, { meetingUrl: "https://meet.google.com/abc-defg-hij" }),
			ev("b", work, "Design review: island reminders", day(0, 16), day(0, 17)),
			ev("c", family, "Jantar com a família", day(0, 20), day(0, 22), { location: "Casa" }),
			ev("d", work, "1:1", day(1, 10), day(1, 10, 30)),
			ev("e", holidays, "Feriado", day(5), day(6), { allDay: true }),
			ev("f", family, "Viagem", day(9), day(12), { allDay: true }),
			ev("g", work, "Sprint planning", day(-3, 9), day(-3, 11)),
		].sort((a, b) => a.start - b.start),
		range: [day(-40), day(100)],
		loading: false,
		updatedAt: now,
	});
}

/** Activities, notifications, Ask Claude and the shelf (ported from Windows Island). */
function publishWindowsIsland(now: number) {
	publishLocal("activities", {
		apiPort: 5199, hasBattery: true,
		items: [
			{
				id: "render",
				title: "Rendering video",
				subtitle: "trailer-final.mp4",
				caption: null,
				icon: "sync",
				image: null,
				color: "#64D2FF",
				progress: 0.62,
				expiresAt: null,
				priority: 40,
				action: null,
				style: "standard",
				expand: false,
				source: "api",
				updatedAt: now,
			},
		],
	});
	publishLocal("notifications", {
		access: "allowed",
		error: null,
		items: [
			{ id: 1, app: "WhatsApp", aumid: "", logo: null, title: "Ana", body: "Are we still on for tonight?", receivedAt: now - 60_000, read: true },
			{ id: 2, app: "Outlook", aumid: "", logo: null, title: "Weekly sync", body: "Moved to 3 PM", receivedAt: now - 1_800_000, read: true },
		],
	});
	publishLocal("ask", {
		available: true,
		running: false,
		status: null,
		unread: false,
		hotkey: "Ctrl+Alt+Space",
		messages: [
			{ fromUser: true, text: "What does EADDRINUSE mean?", error: false, attachments: [] },
			{
				fromUser: false,
				text: "It means the **port is already in use** by another process.\n- Find it with `netstat -ano | findstr :3000`\n- Stop it, or pick another port.",
				error: false,
				attachments: [],
			},
		],
	});
	publishLocal("shelf", {
		items: [
			{ path: "C:\Users\me\Desktop\report.pdf", name: "report.pdf", isDir: false, ext: "pdf", thumb: null },
			{ path: "C:\Users\me\Pictures", name: "Pictures", isDir: true, ext: "", thumb: null },
			{ path: "C:\Users\me\Desktop\cover.png", name: "cover.png", isDir: false, ext: "png", thumb: art },
		],
	});
	// The volume OSD every 20s, to preview alerts.
	setInterval(() => {
		const level = 0.3 + Math.random() * 0.6;
		publishLocal("activities", {
			apiPort: 5199, hasBattery: true,
			items: [
				{
					id: "system.volume",
					title: "Volume",
					subtitle: null,
					caption: null,
					icon: "volume",
					image: null,
					color: null,
					progress: level,
					expiresAt: Date.now() + 1600,
					priority: 100,
					action: null,
					style: "level",
					expand: false,
					source: "volume",
					updatedAt: Date.now(),
				},
			],
		});
		setTimeout(() => publishLocal("activities", { apiPort: 5199, hasBattery: true, items: [] }), 1600);
	}, 20_000);
}

/** Clipboard history; a new screenshot arrives after 8 s to preview the pill and the big picture. */
function publishClipboard(now: number) {
	const item = (id: number, fields: Record<string, unknown>) => ({
		id,
		kind: "text",
		preview: null,
		chars: null,
		thumb: null,
		width: null,
		height: null,
		path: null,
		names: [],
		screenshot: false,
		source: null,
		copiedAt: now,
		quiet: true,
		...fields,
	});
	const history = [
		item(3, { preview: "netstat -ano | findstr :5199", chars: 28, source: "Visual Studio Code", copiedAt: now - 40_000 }),
		item(2, { kind: "files", names: ["report.pdf", "cover.png"], source: "Windows Explorer", copiedAt: now - 300_000 }),
		item(1, { preview: "https://github.com/HeyyCzer/windows-dynamic-island/issues/128", chars: 61, source: "Google Chrome", copiedAt: now - 900_000 }),
	];
	publishLocal("clipboard", { items: history });
	setTimeout(() => {
		const shot = item(4, { kind: "image", thumb: art, width: 1920, height: 1080, path: "C:\shot.png", screenshot: true, source: "Snipping Tool", copiedAt: Date.now(), quiet: false });
		publishLocal("clipboard", { items: [shot, ...history] });
	}, 8_000);
}

/** System monitor: a minute of wobbling numbers. */
function publishMonitor() {
	const history = { cpu: [] as number[], memory: [] as number[], gpu: [] as number[], down: [] as number[], up: [] as number[] };
	const push = (list: number[], v: number) => {
		list.push(v);
		if (list.length > 60) list.shift();
	};
	const tick = () => {
		const t = Date.now() / 1000;
		const cpu = 22 + 14 * Math.sin(t / 5) + Math.random() * 8;
		const gpu = 35 + 30 * Math.sin(t / 9);
		push(history.cpu, cpu);
		push(history.memory, 61 + Math.sin(t / 20) * 2);
		push(history.gpu, gpu);
		push(history.down, 400_000 + Math.random() * 2_600_000);
		push(history.up, 20_000 + Math.random() * 90_000);
		publishLocal("monitor", {
			cpu,
			gpu,
			memoryUsed: 10.4 * 1024 ** 3,
			memoryTotal: 16 * 1024 ** 3,
			down: history.down[history.down.length - 1],
			up: history.up[history.up.length - 1],
			history: { ...history },
			cores: 16,
		});
	};
	tick();
	setInterval(tick, 1000);
}

import { defineMock, provider } from "./kit";

/** "default" is each agent's sample list; the others leave a single session in that state. */
export const AGENT_STATES = ["default", "working", "waiting", "done", "idle", "none"] as const;
type AgentState = (typeof AGENT_STATES)[number];

type Session = Record<string, unknown> & { id: string; status: string };

const usage = (now: number, millions: number[], perMillion: number) => ({
	daily: millions.map((m, i) => ({
		date: new Date(now - (6 - i) * 86_400_000).toISOString().slice(0, 10),
		tokens: Math.round(m * 1_000_000),
		responses: Math.round(m * perMillion),
	})),
});

/** `lead` with the timestamps a fresh session in `status` would have. */
function sessionIn(lead: Session, status: Exclude<AgentState, "default" | "none">, permission: object | null): Session {
	const now = Date.now();
	const busy = status === "working" || status === "waiting";
	return {
		...lead,
		status,
		activity: busy ? lead.activity : null,
		turnStartedAt: now - 42_000,
		finishedAt: status === "done" ? now : null,
		lastEventAt: now,
		summary: status === "done" ? "Done: every test passes again." : null,
		permission: status === "waiting" ? permission : null,
	};
}

/** The DevTools controls and state switching shared by every agent mock. */
function agentMock<T extends { sessions: Session[] }>(opts: {
	label: string;
	state: ReturnType<typeof provider<T>>;
	/** What a "waiting" session asks for, if the agent can ask from the island. */
	permission?: object;
	extra?: Parameters<typeof defineMock>[0]["controls"];
	actions?: Record<string, (payload: unknown) => unknown>;
}) {
	const { state } = opts;
	const initial = state.get().sessions;
	const [lead] = initial;
	let current: AgentState = "default";

	const setState = (next: string) => {
		current = next as AgentState;
		const sessions =
			current === "default" ? initial : current === "none" ? [] : [sessionIn(lead, current, opts.permission ?? null)];
		state.set((s) => ({ ...s, sessions }));
	};

	return {
		setState,
		mock: defineMock({
			label: opts.label,
			start: () => state.publish(),
			controls: [
				{ kind: "select", label: "State", options: AGENT_STATES, value: () => current, set: setState },
				...(opts.extra ?? []),
			],
			actions: {
				[state.id]: {
					// Answering a permission request lets the session carry on.
					permission: () => current === "waiting" && setState("working"),
					...opts.actions,
				},
			},
		}),
	};
}

const now = Date.now();
const sec = (s: number) => Math.floor((now + s * 1000) / 1000);

export const claudeSessions: Session[] = [
	{
		id: "a",
		project: "windows-island",
		cwd: "~/projects/windows-island",
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
];

const claudeLimits = {
	fiveHour: { usedPct: 38, resetsAt: sec(2 * 3600 + 14 * 60) as number | null },
	sevenDay: { usedPct: 61, resetsAt: sec(3 * 86400) },
	updatedAt: now,
};

export const claudeState = provider("claude", {
	sessions: claudeSessions,
	limits: claudeLimits,
	limitsResetAt: null as number | null,
	model: "Opus",
	tokensToday: { input: 184_000, output: 92_500, cacheRead: 4_200_000, cacheWrite: 310_000, messages: 146 },
	usage: { ...usage(now, [5.1, 8.4, 2.2, 0, 11.9, 6.3, 4.6], 9), last5hTokens: 2_300_000 },
	integration: { hooks: true, statusline: true, serverOk: true, permissions: true },
});

export const claude = agentMock({
	label: "Claude",
	state: claudeState,
	permission: { id: "p1", tool: "Bash", detail: "bun test --coverage", always: "Bash(bun test:*)", since: now },
	extra: [
		{
			kind: "button",
			label: "5h limit reset",
			// The backend rolls the window over, flags it for a while, then clears the flag.
			run: () => {
				const limits = { ...claudeLimits, fiveHour: { usedPct: 0, resetsAt: null }, updatedAt: Date.now() };
				claudeState.set((s) => ({ ...s, limits, limitsResetAt: Date.now() }));
				setTimeout(() => claudeState.set((s) => ({ ...s, limitsResetAt: null })), 6_000);
			},
		},
	],
});

const codexState = provider("codex", {
	available: true,
	sessions: [
		{
			id: "x",
			project: "rust-cli",
			cwd: "~/projects/rust-cli",
			status: "working",
			activity: { kind: "run", arg: "cargo test" },
			turnStartedAt: now - 42_000,
			finishedAt: null,
			lastEventAt: now - 2_000,
			model: "gpt-5-codex",
			contextPct: 23,
			summary: null,
			prompt: "Port the config parser to serde",
		},
	] as Session[],
	limits: {
		primary: { usedPct: 22, windowMinutes: 300, resetsAt: sec(3 * 3600 + 5 * 60) },
		secondary: { usedPct: 47, windowMinutes: 10_080, resetsAt: sec(4 * 86400) },
		updatedAt: now,
	},
	model: "gpt-5-codex",
	tokensToday: { input: 96_000, output: 41_000, cacheRead: 1_300_000, cacheWrite: 0, messages: 58 },
	usage: { ...usage(now, [1.2, 0, 3.4, 2.1, 0.8, 4.0, 1.4], 7), last5hTokens: 900_000 },
});

export const codex = agentMock({
	label: "Codex",
	state: codexState,
	extra: [
		{
			kind: "toggle",
			label: "Installed",
			value: () => codexState.get().available,
			set: (available) => codexState.set((s) => ({ ...s, available })),
		},
	],
});

const ANTIGRAVITY_STATES = ["connected", "not-running", "service-unavailable", "not installed"] as const;
const DEFAULT_ANTIGRAVITY = String.raw`C:\Users\me\AppData\Local\Programs\Antigravity\Antigravity.exe`;
const antigravityLimits = [
	{ id: "antigravity-0-5h", label: "Gemini Models", window: "5h", usedPct: 38, resetsAt: now + 2 * 3600_000 },
	{ id: "antigravity-0-weekly", label: "Gemini Models", window: "weekly", usedPct: 12, resetsAt: now + 5 * 86400_000 },
];
let antigravityMode: (typeof ANTIGRAVITY_STATES)[number] = "connected";

const antigravityState = provider("antigravity", {
	available: true,
	exe: DEFAULT_ANTIGRAVITY,
	defaultExe: DEFAULT_ANTIGRAVITY,
	connected: true,
	error: null as string | null,
	limits: antigravityLimits,
});

const setAntigravity = (mode: string) => {
	antigravityMode = mode as typeof antigravityMode;
	const connected = mode === "connected";
	antigravityState.set((s) => ({
		...s,
		available: mode !== "not installed",
		connected,
		error: connected || mode === "not installed" ? null : mode,
		limits: connected ? antigravityLimits : [],
	}));
};

export const antigravity = defineMock({
	label: "Antigravity",
	start: () => antigravityState.publish(),
	controls: [
		{ kind: "select", label: "State", options: ANTIGRAVITY_STATES, value: () => antigravityMode, set: setAntigravity },
	],
	actions: {
		antigravity: {
			launch: () => setAntigravity("connected"),
			pickExe: () => String.raw`D:\Apps\Antigravity\Antigravity.exe`,
			setExe: (exe) => antigravityState.set((s) => ({ ...s, exe: (exe as string | null) ?? DEFAULT_ANTIGRAVITY })),
		},
	},
});

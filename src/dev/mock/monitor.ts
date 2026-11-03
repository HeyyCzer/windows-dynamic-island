import { defineMock, provider } from "./kit";

const KEYS = ["cpu", "memory", "gpu", "down", "up"] as const;
const history = Object.fromEntries(KEYS.map((k) => [k, [] as number[]])) as Record<(typeof KEYS)[number], number[]>;

const state = provider("monitor", {
	cpu: 0,
	gpu: 0,
	memoryUsed: 10.4 * 1024 ** 3,
	memoryTotal: 16 * 1024 ** 3,
	down: 0,
	up: 0,
	history: { ...history },
	cores: 16,
});

/** One second of wobbling numbers; `load` pushes CPU/GPU up. */
let load = 0;
function tick() {
	const t = Date.now() / 1000;
	const sample = {
		cpu: Math.min(100, 22 + 14 * Math.sin(t / 5) + Math.random() * 8 + load),
		memory: 61 + Math.sin(t / 20) * 2,
		gpu: Math.min(100, 35 + 30 * Math.sin(t / 9) + load),
		down: 400_000 + Math.random() * 2_600_000,
		up: 20_000 + Math.random() * 90_000,
	};
	for (const k of KEYS) {
		history[k].push(sample[k]);
		if (history[k].length > 60) history[k].shift();
	}
	const { memory: _, ...now } = sample;
	state.set((s) => ({ ...s, ...now, history: { ...history } }));
}

export const monitor = defineMock({
	label: "System monitor",
	start() {
		tick();
		setInterval(tick, 1000);
	},
	controls: [{ kind: "toggle", label: "Heavy load", value: () => load > 0, set: (on) => (load = on ? 50 : 0) }],
});

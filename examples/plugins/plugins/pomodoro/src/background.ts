/**
 * Owns the timer: wakes up when a phase ends, keeps the compact pill ticking
 * while it runs, and asks for attention when it's time to switch.
 */
import { duration, format, initial, left, next, reset, type Timer, toggle } from "./timer";

const today = () => new Date().toDateString();

await island.ready;

const saved = await island.storage.get<{ day: string; rounds: number }>("rounds");
let timer: Timer = island.state.get<Timer>() ?? initial(saved?.day === today() ? saved.rounds : 0);
let tick: ReturnType<typeof setInterval> | undefined;
let end: ReturnType<typeof setTimeout> | undefined;

function update(next: Timer) {
	timer = next;
	void island.state.set(timer);
	void island.storage.set("rounds", { day: today(), rounds: timer.rounds });
	schedule();
}

function schedule() {
	clearInterval(tick);
	clearTimeout(end);
	if (timer.running && timer.endsAt) {
		tick = setInterval(render, 1000);
		end = setTimeout(() => update(next(timer, true)), Math.max(0, timer.endsAt - Date.now()));
	}
	render();
}

function render() {
	const color = timer.phase === "work" ? "#ff6b63" : "#34c759";
	const done = timer.doneAt !== null && !timer.running;
	void island.setView("timer", {
		active: timer.running || done,
		priority: done ? 70 : 60,
		accent: color,
		compact: {
			left: [{ icon: "icon.svg" }, { text: island.t(done ? `done.${timer.phase === "work" ? "break" : "work"}` : `phase.${timer.phase}`), bold: true }],
			right: done ? undefined : { text: format(left(timer)), mono: true, color },
			width: done ? 280 : 230,
		},
		ambient: timer.rounds ? { text: String(timer.rounds), color } : null,
		// A new value opens the island on the timer for a moment.
		activityKey: timer.doneAt ? `done:${timer.doneAt}` : undefined,
		attention: done,
	});
}

// The panel changes the timer through the shared state.
island.state.subscribe<Timer>((value) => {
	if (value && value !== timer) {
		timer = value;
		void island.storage.set("rounds", { day: today(), rounds: timer.rounds });
		schedule();
	}
});

island.onShortcut((id) => {
	if (id === "toggle") update(toggle(timer));
	if (id === "reset") update(reset(timer));
});

// New durations apply to a timer that hasn't started.
island.settings.subscribe(() => {
	if (!timer.running && timer.remaining !== duration(timer.phase)) update({ ...timer, remaining: duration(timer.phase) });
	else render();
});
island.onLocaleChange(render);

update(timer);

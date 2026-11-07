/** The timer, shared by the background (which owns it) and the panel. */

export type Phase = "work" | "break";

export interface Timer {
	phase: Phase;
	running: boolean;
	/** When the running phase ends (ms since epoch). */
	endsAt: number | null;
	/** Time left while paused (ms). */
	remaining: number;
	/** Focus rounds finished today. */
	rounds: number;
	/** When the last phase ended, until the user moves on: the island asks for attention. */
	doneAt: number | null;
}

const MINUTE = 60_000;

export const duration = (phase: Phase) =>
	(phase === "work" ? island.settings.get<number>("work") : island.settings.get<number>("break")) * MINUTE;

export const initial = (rounds = 0): Timer => ({
	phase: "work",
	running: false,
	endsAt: null,
	remaining: duration("work"),
	rounds,
	doneAt: null,
});

export const left = (t: Timer, now = Date.now()) =>
	t.running && t.endsAt ? Math.max(0, t.endsAt - now) : t.remaining;

export function toggle(t: Timer, now = Date.now()): Timer {
	return t.running
		? { ...t, running: false, endsAt: null, remaining: left(t, now) }
		: { ...t, running: true, endsAt: now + t.remaining, doneAt: null };
}

export const reset = (t: Timer): Timer => ({ ...initial(t.rounds), phase: t.phase, remaining: duration(t.phase) });

/** Ends the current phase now; `finished` counts a focus round. */
export function next(t: Timer, finished: boolean, now = Date.now()): Timer {
	const phase: Phase = t.phase === "work" ? "break" : "work";
	const rounds = t.rounds + (finished && t.phase === "work" ? 1 : 0);
	const autoBreak = phase === "break" && island.settings.get<boolean>("auto-break");
	return {
		phase,
		rounds,
		running: autoBreak,
		endsAt: autoBreak ? now + duration(phase) : null,
		remaining: duration(phase),
		doneAt: finished ? now : null,
	};
}

export function format(ms: number) {
	const s = Math.ceil(ms / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

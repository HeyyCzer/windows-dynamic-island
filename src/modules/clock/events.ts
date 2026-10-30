import type { CalEvent, CalendarInfo } from "./types";

export const DAY_MS = 86_400_000;
/** A reminder stays up this long after its event started. */
const GRACE_MS = 5 * 60_000;
/** A reminder further ahead than this shows for this long only. */
const HOLD_MS = 60 * 60_000;
/** Most dots under a day of the month view. */
const MAX_DOTS = 3;
/** Multi-day events are marked on at most this many days. */
const MAX_SPAN_DAYS = 62;

export const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Events overlapping `day`, all-day ones first. */
export function eventsOn(events: CalEvent[], day: Date): CalEvent[] {
	const from = startOfDay(day).getTime();
	const to = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
	return events
		.filter((e) => e.start < to && (e.end > from || (e.end === e.start && e.start >= from)))
		.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
}

/** Day (`toDateString()`) → colors of its calendars, for the dots of the month view. */
export function dayDots(events: CalEvent[], calendars: CalendarInfo[]): Map<string, string[]> {
	const color = new Map(calendars.map((c) => [c.key, c.color]));
	const dots = new Map<string, string[]>();
	for (const e of events) {
		const c = color.get(e.calendar) ?? "#8E8E93";
		const day = startOfDay(new Date(e.start));
		// `end` is exclusive: an event ending at midnight doesn't reach that day.
		const last = Math.max(e.start, e.end - 1);
		for (let i = 0; i < MAX_SPAN_DAYS && day.getTime() <= last; i++) {
			const key = day.toDateString();
			const list = dots.get(key) ?? [];
			if (list.length < MAX_DOTS && !list.includes(c)) list.push(c);
			dots.set(key, list);
			day.setDate(day.getDate() + 1);
		}
	}
	return dots;
}

/** Minutes before an event its reminders go off. */
export type LeadsOf = (e: CalEvent) => number[];

export interface DueReminder {
	event: CalEvent;
	/** Minutes before the start of the reminder that went off last. */
	lead: number;
}

/** When the reminder pill goes away: a few minutes into the event, or when it ends. */
const reminderEnd = (e: CalEvent) => Math.min(e.start + GRACE_MS, Math.max(e.end, e.start + 60_000));

/**
 * The timed event to remind about at `now`. A reminder stays up until the
 * event is a few minutes in, except early ones (more than `HOLD_MS` ahead),
 * which go away after `HOLD_MS` and leave the island free until the next one.
 */
export function dueReminder(events: CalEvent[], now: number, leadsOf: LeadsOf): DueReminder | undefined {
	for (const event of events) {
		if (event.allDay || now >= reminderEnd(event)) continue;
		const fired = leadsOf(event).filter((m) => {
			const at = event.start - m * 60_000;
			return at <= now && (m * 60_000 <= HOLD_MS || now < at + HOLD_MS);
		});
		if (fired.length) return { event, lead: Math.min(...fired) };
	}
	return undefined;
}

/** A reminder of a timed event goes off within `withinMs`, to know when to start ticking. */
export function reminderSoon(events: CalEvent[], now: number, withinMs: number, leadsOf: LeadsOf): boolean {
	return events.some(
		(e) =>
			!e.allDay &&
			e.start > now &&
			[0, ...leadsOf(e)].some((m) => {
				const at = e.start - m * 60_000;
				return at > now && at - now <= withinMs;
			}),
	);
}

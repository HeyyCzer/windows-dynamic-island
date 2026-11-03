import { defineMock, provider } from "./kit";

const WORK = "google:me@example.com";
const FAMILY = "google:family";
const HOLIDAYS = "ics:4f2a91";

const day = (offset: number, h = 0, m = 0) => {
	const d = new Date();
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, h, m).getTime();
};

const event = (id: string, calendar: string, title: string, start: number, end: number, extra: object = {}) => ({
	id,
	calendar,
	title,
	start,
	end,
	allDay: false,
	location: null,
	meetingUrl: null,
	url: "https://calendar.google.com/",
	reminders: [10],
	...extra,
});

const calendar = (key: string, name: string, color: string, source: string) => ({
	key,
	name,
	color,
	source,
	defaultVisible: true,
	visible: true,
	error: null,
});

/** The stand-up, `inMinutes` from now (rounded to the minute, like real events). */
const standUp = (inMinutes: number) => {
	const start = Math.ceil((Date.now() + inMinutes * 60_000) / 60_000) * 60_000;
	return event("a", WORK, "Daily stand-up", start, start + 15 * 60_000, {
		meetingUrl: "https://meet.google.com/abc-defg-hij",
	});
};

const events = (inMinutes: number) =>
	[
		standUp(inMinutes),
		event("b", WORK, "Design review: island reminders", day(0, 16), day(0, 17)),
		event("c", FAMILY, "Jantar com a família", day(0, 20), day(0, 22), { location: "Casa" }),
		event("d", WORK, "1:1", day(1, 10), day(1, 10, 30)),
		event("e", HOLIDAYS, "Feriado", day(5), day(6), { allDay: true }),
		event("f", FAMILY, "Viagem", day(9), day(12), { allDay: true }),
		event("g", WORK, "Sprint planning", day(-3, 9), day(-3, 11)),
	].sort((a, b) => a.start - b.start);

const STAND_UP_IN = ["8", "1", "0", "-5", "60"] as const;
let standUpIn: string = STAND_UP_IN[0];

const state = provider("calendar", {
	google: { builtinClient: true, hasClient: true, connected: true, account: "me@example.com", error: null },
	feeds: [{ id: "4f2a91", host: "calendar.google.com", name: "Feriados no Brasil", error: null }],
	calendars: [
		calendar(WORK, "me@example.com", "#039BE5", "google"),
		calendar(FAMILY, "Família", "#33B679", "google"),
		calendar(HOLIDAYS, "Feriados no Brasil", "#FF9F0A", "ics"),
	],
	// Starts in 8 minutes: shows the reminder pill right away.
	events: events(8),
	range: [day(-40), day(100)],
	loading: false,
	updatedAt: Date.now(),
});

export const calendarMock = defineMock({
	label: "Calendar",
	start: () => state.publish(),
	controls: [
		{
			kind: "select",
			label: "Stand-up in (min)",
			options: STAND_UP_IN,
			value: () => standUpIn,
			set: (minutes) => {
				standUpIn = minutes;
				state.set((s) => ({ ...s, events: events(Number(minutes)), updatedAt: Date.now() }));
			},
		},
		{
			kind: "toggle",
			label: "Google connected",
			value: () => state.get().google.connected,
			set: (connected) => state.set((s) => ({ ...s, google: { ...s.google, connected } })),
		},
	],
});

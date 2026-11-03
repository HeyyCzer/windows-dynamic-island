/**
 * `?demo`, the README GIF: a quiet island where things happen one after
 * another — a WhatsApp message, the next song, Claude asking to run a command.
 */
import { clearActivities, showVolume } from "./activities";
import { claudeSessions, claudeState } from "./agents";
import { setAsk } from "./ask";
import { setClipboard } from "./clipboard";
import type { Mock } from "./kit";
import { playTrack } from "./music";
import { notificationMessage, notify, setNotifications } from "./notifications";
import { setShelf } from "./shelf";

/** The mocks the tour shows; the others stay unpublished. */
export function startDemo(mocks: Mock[]) {
	for (const m of mocks) m.start?.();
	playTrack(0);

	const now = Date.now();
	const [editing, waiting, finished] = claudeSessions;
	const tests = {
		...waiting,
		status: "working",
		activity: { kind: "run", arg: "bun test" },
		turnStartedAt: now - 95_000,
		lastEventAt: now,
		permission: null as object | null,
	};
	const claude = (...sessions: object[]) => claudeState.set((s) => ({ ...s, sessions: sessions as typeof s.sessions }));
	// Starts once the opening peek of the first song is over.
	const at = (ms: number, fn: () => void) => setTimeout(fn, 4_000 + ms);

	claude(editing, finished);
	clearActivities();
	setNotifications((s) => ({
		...s,
		items: [notificationMessage(2, "Outlook", "Weekly sync", "Moved to 3 PM", now - 1_800_000)],
	}));
	setAsk((s) => ({ ...s, messages: [] }));
	setShelf({ items: [] });
	setClipboard({ items: [] });

	at(2_500, () => notify("WhatsApp", "Ana", "Are we still on for tonight?"));
	at(7_000, () => setNotifications((s) => ({ ...s, items: s.items.map((n) => ({ ...n, read: true })) })));
	at(8_500, () => playTrack(1, 41_000));
	at(13_500, () =>
		claude(
			{
				...tests,
				status: "waiting",
				activity: { kind: "run", arg: "bun test", permission: true },
				tool: "Bash",
				lastEventAt: Date.now(),
				permission: {
					id: "p1",
					tool: "Bash",
					detail: "bun test --coverage",
					always: "Bash(bun test:*)",
					since: Date.now(),
				},
			},
			editing,
			finished,
		),
	);
	at(18_500, () => claude({ ...tests, lastEventAt: Date.now() }, editing, finished));
	at(20_500, () => showVolume(0.72));
}

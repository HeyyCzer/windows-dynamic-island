/**
 * Fake backend for designing the UI in a regular browser (`bun run dev`).
 *
 * Each file here mocks one provider; to add one, write a `defineMock` and list
 * it in {@link mocks}. Its controls show up in DevTools on their own.
 */
import { handleLocalCalls } from "../../core/bridge";
import { activities } from "./activities";
import { antigravity, claude, codex } from "./agents";
import { ask } from "./ask";
import { calendarMock } from "./calendar";
import { clipboard } from "./clipboard";
import { startDemo } from "./demo";
import { github } from "./github";
import { logCall, type Mock } from "./kit";
import { monitor } from "./monitor";
import { music } from "./music";
import { notifications } from "./notifications";
import { pluginsMock } from "./plugins";
import { shelf } from "./shelf";
import { system } from "./system";

/** In DevTools order. */
export const mocks: Mock[] = [
	system,
	music,
	claude.mock,
	codex.mock,
	antigravity,
	activities,
	notifications,
	clipboard,
	ask,
	shelf,
	github,
	calendarMock,
	monitor,
	pluginsMock,
];

/** Sent every few frames while the island animates: would drown the log. */
const UNLOGGED = new Set(["set_hit_rects"]);

function answer(target: "provider" | "command", id: string, name: string, payload: unknown) {
	const handler =
		target === "provider"
			? mocks.find((m) => m.actions?.[id]?.[name])?.actions?.[id][name]
			: mocks.find((m) => m.commands?.[name])?.commands?.[name];
	if (!UNLOGGED.has(name))
		logCall({ at: Date.now(), target: target === "provider" ? id : "command", name, payload, handled: !!handler });
	return handler?.(payload);
}

export function startMock() {
	handleLocalCalls(answer);
	// `?demo` plays the scripted README tour instead.
	if (new URLSearchParams(location.search).has("demo")) {
		startDemo([system, music, claude.mock, activities, notifications, clipboard, ask, shelf, monitor]);
		return;
	}
	for (const m of mocks) m.start?.();
}

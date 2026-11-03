import { defineMock, provider } from "./kit";

type Message = { fromUser: boolean; text: string; error: boolean; attachments: unknown[] };

const say = (fromUser: boolean, text: string, attachments: unknown[] = []): Message => ({
	fromUser,
	text,
	error: false,
	attachments,
});

const state = provider("ask", {
	available: true,
	running: false,
	status: null as { kind: "thinking" | "writing" | "tool"; arg: string | null } | null,
	unread: false,
	messages: [
		say(true, "What does EADDRINUSE mean?"),
		say(
			false,
			"It means the **port is already in use** by another process.\n- Find it with `netstat -ano | findstr :3000`\n- Stop it, or pick another port.",
		),
	],
});

let viewing = false;
let reply: number | undefined;

function stop() {
	window.clearTimeout(reply);
	state.set((s) => ({ ...s, running: false, status: null }));
}

/** Fakes an answer: thinking, then the text, unread unless the page is open. */
function answer() {
	window.clearTimeout(reply);
	state.set((s) => ({ ...s, running: true, status: { kind: "thinking", arg: null } }));
	reply = window.setTimeout(() => {
		state.set((s) => ({
			...s,
			running: false,
			status: null,
			unread: !viewing,
			messages: [...s.messages, say(false, "This is a mock answer: the backend isn't running in the browser.")],
		}));
	}, 2_000);
}

export const ask = defineMock({
	label: "Ask Claude",
	start: () => state.publish(),
	controls: [
		{
			kind: "toggle",
			label: "Answering",
			value: () => state.get().running,
			set: (on) => (on ? answer() : stop()),
		},
		{ kind: "button", label: "Unread answer", run: () => state.set((s) => ({ ...s, unread: true })) },
	],
	actions: {
		ask: {
			send: (payload) => {
				const { text, attachments } = payload as { text: string; attachments: unknown[] };
				state.set((s) => ({ ...s, messages: [...s.messages, say(true, text, attachments)] }));
				answer();
			},
			cancel: stop,
			new: () => state.set((s) => ({ ...s, messages: [], unread: false })),
			viewing: (on) => {
				viewing = !!on;
				if (viewing) state.set((s) => ({ ...s, unread: false }));
			},
		},
	},
});

export const setAsk = state.set;

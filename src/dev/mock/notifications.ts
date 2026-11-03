import { activity, showActivity } from "./activities";
import { defineMock, provider } from "./kit";

const ACCESS = ["allowed", "denied", "noIdentity", "unavailable"] as const;

const message = (id: number, app: string, title: string, body: string, receivedAt: number, read = true) => ({
	id,
	app,
	aumid: "",
	logo: null,
	title,
	body,
	receivedAt,
	read,
});

const now = Date.now();
const state = provider("notifications", {
	access: "allowed" as string,
	error: null,
	items: [
		message(1, "WhatsApp", "Ana", "Are we still on for tonight?", now - 60_000),
		message(2, "Outlook", "Weekly sync", "Moved to 3 PM", now - 1_800_000),
	],
});

const samples = [
	["WhatsApp", "Ana", "Are we still on for tonight?"],
	["Discord", "#general", "New release is out 🎉"],
	["Outlook", "Weekly sync", "Moved to 3 PM"],
] as const;
let nextId = 3;

/** A new toast: the backend adds it to the list and shows it as an activity. */
export function notify(app: string, title: string, body: string) {
	const id = nextId++;
	state.set((s) => ({ ...s, items: [message(id, app, title, body, Date.now(), false), ...s.items] }));
	showActivity(
		activity(`notification.${id}`, {
			title,
			subtitle: body,
			caption: app,
			icon: "bell",
			color: "#0A84FF",
			priority: 60,
			expand: true,
			source: "notification",
		}),
		4_500,
	);
}

export const notifications = defineMock({
	label: "Notifications",
	start: () => state.publish(),
	controls: [
		{
			kind: "button",
			label: "New notification",
			run: () => {
				const [app, title, body] = samples[nextId % samples.length] ?? samples[0];
				notify(app, title, body);
			},
		},
		{
			kind: "select",
			label: "Access",
			options: ACCESS,
			value: () => state.get().access,
			set: (access) => state.set((s) => ({ ...s, access })),
		},
	],
	actions: {
		notifications: {
			markRead: () => state.set((s) => ({ ...s, items: s.items.map((n) => ({ ...n, read: true })) })),
			clear: () => state.set((s) => ({ ...s, items: [] })),
			enable: () => state.set((s) => ({ ...s, access: "allowed" })),
		},
	},
});

export const setNotifications = state.set;
export { message as notificationMessage };

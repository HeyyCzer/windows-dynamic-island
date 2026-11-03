import { defineMock, provider } from "./kit";

/** Mirrors `Activity` in `src/modules/activities/types.ts`. */
export type MockActivity = ReturnType<typeof activity>;

export const activity = (id: string, fields: Record<string, unknown> = {}) => ({
	id,
	title: "",
	subtitle: null as string | null,
	caption: null as string | null,
	icon: "sync",
	image: null as string | null,
	color: null as string | null,
	progress: null as number | null,
	expiresAt: null as number | null,
	priority: 40,
	action: null,
	style: "standard",
	expand: false,
	source: "api",
	updatedAt: Date.now(),
	...fields,
});

const RENDER_ID = "render";

const state = provider("activities", {
	apiPort: 5199,
	hasBattery: true,
	items: [] as MockActivity[],
});

const remove = (id: string) => state.set((s) => ({ ...s, items: s.items.filter((a) => a.id !== id) }));

/** Adds (or replaces) an activity; with `forMs` it goes away on its own, like the backend's. */
export function showActivity(item: MockActivity, forMs?: number) {
	const expiresAt = forMs ? Date.now() + forMs : item.expiresAt;
	state.set((s) => ({ ...s, items: [...s.items.filter((a) => a.id !== item.id), { ...item, expiresAt }] }));
	if (forMs) setTimeout(() => remove(item.id), forMs);
}

/** The volume OSD the backend shows when the volume changes. */
export function showVolume(level: number) {
	showActivity(
		activity("system.volume", {
			title: "Volume",
			icon: "volume",
			progress: level,
			priority: 100,
			style: "level",
			source: "volume",
		}),
		1600,
	);
}

export function clearActivities() {
	state.set((s) => ({ ...s, items: [] }));
}

const rendering = () => state.get().items.find((a) => a.id === RENDER_ID);

function setRender(progress: number | null) {
	if (progress === null) return remove(RENDER_ID);
	showActivity(
		activity(RENDER_ID, { title: "Rendering video", subtitle: "trailer-final.mp4", color: "#64D2FF", progress }),
	);
}

export const activities = defineMock({
	label: "Activities",
	start: () => setRender(0.62),
	controls: [
		{
			kind: "toggle",
			label: "Rendering video",
			value: () => !!rendering(),
			set: (on) => setRender(on ? 0.62 : null),
		},
		{
			kind: "range",
			label: "Render progress",
			min: 0,
			max: 1,
			step: 0.01,
			value: () => rendering()?.progress ?? 0,
			set: setRender,
		},
		{ kind: "button", label: "Volume OSD", run: () => showVolume(0.3 + Math.random() * 0.6) },
	],
	actions: {
		activities: { remove: (id) => remove(String(id)) },
	},
});

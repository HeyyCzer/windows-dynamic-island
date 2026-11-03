import { art, defineMock, provider } from "./kit";

let nextId = 1;
const item = (fields: Record<string, unknown>) => ({
	id: nextId++,
	kind: "text",
	preview: null,
	chars: null,
	thumb: null,
	width: null,
	height: null,
	path: null,
	names: [] as string[],
	screenshot: false,
	source: null,
	copiedAt: Date.now(),
	quiet: true,
	...fields,
});

const now = Date.now();
const state = provider("clipboard", {
	items: [
		item({
			preview: "https://github.com/HeyyCzer/windows-island/issues/128",
			chars: 61,
			source: "Google Chrome",
			copiedAt: now - 900_000,
		}),
		item({ kind: "files", names: ["report.pdf", "cover.png"], source: "Windows Explorer", copiedAt: now - 300_000 }),
		item({ preview: "netstat -ano | findstr :5199", chars: 28, source: "Visual Studio Code", copiedAt: now - 40_000 }),
	].reverse(),
});

// `quiet: false` is what makes the island show the pill.
const copy = (fields: Record<string, unknown>) =>
	state.set((s) => ({ items: [item({ ...fields, quiet: false }), ...s.items] }));

export const clipboard = defineMock({
	label: "Clipboard",
	start: () => state.publish(),
	controls: [
		{
			kind: "button",
			label: "Screenshot",
			run: () =>
				copy({
					kind: "image",
					thumb: art,
					width: 1920,
					height: 1080,
					path: "C:shot.png",
					screenshot: true,
					source: "Snipping Tool",
				}),
		},
		{
			kind: "button",
			label: "Copy text",
			run: () => copy({ preview: "const answer = 42;", chars: 18, source: "Visual Studio Code" }),
		},
	],
	actions: { clipboard: { clear: () => state.set({ items: [] }) } },
});

export const setClipboard = state.set;

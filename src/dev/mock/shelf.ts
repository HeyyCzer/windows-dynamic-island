import { art, defineMock, provider } from "./kit";

type Item = { path: string; name: string; isDir: boolean; ext: string; thumb: string | null };

const fromPath = (path: string): Item => {
	const name = path.split(/[/]/).pop() ?? path;
	const dot = name.lastIndexOf(".");
	return { path, name, isDir: dot < 1, ext: dot < 1 ? "" : name.slice(dot + 1), thumb: null };
};

const state = provider("shelf", {
	items: [
		fromPath("C:UsersmeDesktop\report.pdf"),
		fromPath("C:UsersmePictures"),
		{ ...fromPath("C:UsersmeDesktopcover.png"), thumb: art },
	],
});

export const shelf = defineMock({
	label: "Shelf",
	start: () => state.publish(),
	controls: [
		{
			kind: "button",
			label: "Add file",
			run: () =>
				state.set((s) => ({ items: [...s.items, fromPath(`C:UsersmeDownloads\file-${s.items.length + 1}.zip`)] })),
		},
	],
	actions: {
		shelf: {
			add: (paths) => state.set((s) => ({ items: [...s.items, ...(paths as string[]).map(fromPath)] })),
			remove: (path) => state.set((s) => ({ items: s.items.filter((i) => i.path !== path) })),
			clear: () => state.set({ items: [] }),
		},
	},
});

export const setShelf = state.set;

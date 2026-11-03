import { emitLocal } from "../../core/bridge";
import { changed, defineMock, provider } from "./kit";

const shortcuts = provider("shortcuts", {
	ask: { keys: "Ctrl+Alt+Space", taken: null },
	find: { keys: "Ctrl+Alt+F", taken: null },
});

let fullscreen = false;

/** Window and backend events that aren't any provider's state. */
export const system = defineMock({
	label: "System",
	start: () => shortcuts.publish(),
	controls: [
		{
			kind: "toggle",
			label: "Fullscreen app",
			value: () => fullscreen,
			set: (on) => {
				fullscreen = on;
				emitLocal("island://fullscreen", on);
				changed();
			},
		},
		{ kind: "button", label: "Ask shortcut", run: () => emitLocal("island://ask", null) },
		{ kind: "button", label: "Find shortcut", run: () => emitLocal("island://find", null) },
		{ kind: "button", label: "PiP returned", run: () => emitLocal("pip://return", null) },
		{ kind: "button", label: "Recenter", run: () => emitLocal("island://recenter", null) },
	],
});

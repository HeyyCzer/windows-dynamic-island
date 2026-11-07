// An on-demand background, the way most plugins should be: no timer of its
// own keeps the page alive. The island starts it when the plugin turns on,
// when the alarm fires, when the panel changes the state or a setting
// changes, and stops it a few seconds after it goes quiet.
await island.ready;

const ACCENT = "#5ac8fa";
const today = () => new Date().toDateString();

/** `{ day, glasses, dueAt }`: the shared state outlives this page, storage outlives the app. */
async function load() {
	const value = island.state.get() ?? (await island.storage.get("state"));
	return value?.day === today() ? value : { day: today(), glasses: 0, dueAt: value?.dueAt ?? null };
}
let state = await load();

async function save(next) {
	state = next;
	await island.state.set(state);
	await island.storage.set("state", state);
	render();
}

function render() {
	const due = state.dueAt !== null;
	island.setView("main", {
		active: due,
		priority: 55,
		accent: ACCENT,
		compact: due
			? { left: [{ icon: "icon.svg" }, { text: island.t("compact.due"), bold: true }], width: 250 }
			: undefined,
		ambient: state.glasses ? { text: String(state.glasses), color: ACCENT } : null,
		attention: due,
		// A new value opens the island on this module for a moment.
		activityKey: due ? `due:${state.dueAt}` : undefined,
	});
}

/**
 * Alarms outlive the page, so this code runs again on every wake-up: only
 * (re)create the alarm when it's missing or the interval changed, or each
 * wake-up would push the next reminder back.
 */
async function schedule() {
	const every = island.settings.get("every") * 60;
	const [alarm] = await island.alarms.list();
	if (alarm?.every !== every) await island.alarms.create("remind", { every });
}

island.onAlarm(() => save({ ...state, day: today(), glasses: state.day === today() ? state.glasses : 0, dueAt: Date.now() }));

// The panel logs a glass through the shared state.
island.state.subscribe((value) => {
	if (value && value !== state) save(value);
});
island.settings.subscribe(() => void schedule());
island.onLocaleChange(render);

await schedule();
render();

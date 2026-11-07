// The panel only draws and logs glasses: the background owns the reminder.
await island.ready;

const glasses = document.getElementById("glasses");
const label = document.getElementById("label");
const next = document.getElementById("next");
const drink = document.getElementById("drink");

const today = () => new Date().toDateString();
const current = () => {
	const state = island.state.get();
	return state?.day === today() ? state : { day: today(), glasses: 0, dueAt: null };
};

async function render() {
	const state = current();
	glasses.textContent = String(state.glasses);
	label.textContent = island.t(state.dueAt ? "panel.due" : "panel.today");
	drink.textContent = island.t("panel.drink");
	const [alarm] = await island.alarms.list();
	next.textContent = alarm
		? island.t("panel.next", { time: new Date(alarm.due).toLocaleTimeString(island.locale, { timeStyle: "short" }) })
		: "";
}

drink.onclick = () => {
	const state = current();
	island.state.set({ ...state, glasses: state.glasses + 1, dueAt: null });
};

island.state.subscribe(render);
island.settings.subscribe(render);
island.onLocaleChange(render);
render();

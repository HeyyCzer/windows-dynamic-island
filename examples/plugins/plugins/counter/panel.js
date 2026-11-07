// The panel only draws: the background owns the count (see background.js).
await island.ready;

const count = document.getElementById("count");
const add = document.getElementById("add");
const reset = document.getElementById("reset");

document.getElementById("hint").textContent = island.t("panel.hint");
reset.textContent = island.t("panel.reset");

function render() {
	count.textContent = String(island.state.get()?.count ?? 0);
	add.textContent = island.t("panel.add", { step: island.settings.get("step") });
}

const current = () => island.state.get()?.count ?? 0;
add.onclick = () => island.state.set({ count: current() + island.settings.get("step") });
reset.onclick = () => island.state.set({ count: 0 });

island.state.subscribe(render);
island.settings.subscribe(render);
island.onLocaleChange(() => location.reload());
render();

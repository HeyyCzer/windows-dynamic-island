// Runs on demand: the island starts it when something happens (the plugin
// turns on, the shortcut, the panel changes the count, a setting changes) and
// stops it a few seconds later. Owns the count: keeps it in storage, shares it
// with the panel through `island.state`, and shows it in the island.
await island.ready;

// The shared state outlives this page: if the panel woke us up, it's the newest.
let count = island.state.get()?.count ?? (await island.storage.get("count")) ?? 0;

function render() {
	island.setView("main", {
		ambient: island.settings.get("bubble") ? { text: String(count), mono: true } : null,
		accent: "#a0a4ff",
	});
}

async function set(next) {
	count = next;
	await island.state.set({ count });
	await island.storage.set("count", count);
	render();
}

// The panel asks for changes through the shared state.
island.state.subscribe((value) => {
	if (value && value.count !== count) set(value.count);
});
island.settings.subscribe(render);
island.onShortcut((id) => {
	if (id === "increment") set(count + island.settings.get("step"));
});

await set(count);

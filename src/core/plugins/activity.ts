import { createStore } from "../island";

export interface PluginActivity {
	active?: boolean;
	priority?: number;
	left?: string;
	right?: string;
	progress?: number;
	accent?: string;
}
export const pluginActivities = createStore<Record<string, PluginActivity>>({});
export function setPluginActivity(id: string, value: PluginActivity | null) {
	pluginActivities.set((s) => {
		const next = { ...s };
		if (value) next[id] = value;
		else delete next[id];
		return next;
	});
}

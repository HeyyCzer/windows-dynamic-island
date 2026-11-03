export const NAVOPATH_ENDPOINT = "https://navopath-mcp.shawn89890916.workers.dev/mcp";

/** The plugin is the shared connection owner; explicitly clearing it disconnects. */
export function resolveNavoPathConnection(plugin: Record<string, unknown> = {}, legacy: Record<string, unknown> = {}) {
	const usePlugin = Object.hasOwn(plugin, "token");
	return {
		endpoint: String(
			(usePlugin ? plugin.mcpEndpoint : legacy["calendar.navopath.endpoint"]) || NAVOPATH_ENDPOINT,
		).trim(),
		token: String((usePlugin ? plugin.token : legacy["calendar.navopath.token"]) || "").trim(),
		source: usePlugin ? "plugin" : "legacy",
	};
}

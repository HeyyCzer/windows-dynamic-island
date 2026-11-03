import { useSettings } from "../settings";
import { resolveNavoPathConnection } from "./navopathConnection";
import { useInstalledPlugins } from "./registry";

/** Calendar and widget read the same saved credentials in every window. */
export function useNavoPathConnection() {
	const settings = useSettings();
	const plugin = useInstalledPlugins().find((item) => item.manifest.id === "com.island.navopath");
	return resolveNavoPathConnection(plugin?.customSettings, settings);
}

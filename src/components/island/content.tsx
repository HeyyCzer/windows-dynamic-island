import type { ReactNode } from "react";
import type { Appearance } from "../../core/appearance";
import { LAUNCHER, type IslandController } from "../../core/useIslandController";
import { IdleClock } from "../IdleClock";
import type { Variant } from "./geometry";
import { Launcher } from "./Launcher";
import { Tabs } from "./Tabs";

/**
 * What fills the island in its current mode. `key` changes whenever the
 * content does, so the swap animates.
 */
export function islandContent(ctl: IslandController, look: Appearance, v: Variant): { key: string; node: ReactNode } {
	const { mode, primary, focused } = ctl;
	const windows = look.style === "windows";

	if (mode === "compact" && primary?.view.compact) {
		return {
			key: `compact:${primary.module.id}`,
			node: (
				<div className="compact">
					<div className="compact-slot">{primary.view.compact.left}</div>
					<div className="compact-slot right">{primary.view.compact.right}</div>
				</div>
			),
		};
	}

	if ((mode === "expanded" || mode === "peek") && (focused || ctl.launcher)) {
		const tabs = mode === "expanded" && (
			<Tabs
				entries={ctl.tabs}
				current={ctl.tab}
				onSelect={ctl.setTab}
				iconsOnly={windows}
				transition={v.shellSpring}
				extra={ctl.launcher ? undefined : focused?.view.tabBarExtra}
			/>
		);
		return {
			key: ctl.launcher ? `big:${LAUNCHER}` : `big:${focused?.module.id}`,
			node: (
				<div className={`expanded ${v.tabsAtBottom ? "tabs-bottom" : ""}`}>
					{!v.tabsAtBottom && tabs}
					<div className="expanded-body">
						{ctl.launcher ? <Launcher entries={ctl.entries} onSelect={ctl.setTab} /> : focused?.view.expanded}
					</div>
					{v.tabsAtBottom && tabs}
				</div>
			),
		};
	}

	if (windows && look.idleClock && (mode === "idle" || mode === "swallowed")) {
		return { key: "clock", node: <IdleClock /> };
	}

	return { key: "idle", node: null };
}

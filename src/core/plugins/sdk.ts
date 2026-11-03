import * as Events from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import * as JSX from "react/jsx-runtime";
import navopath from "../../assets/navopath.png";
import * as Buttons from "../../components/ui/button";
import * as Cards from "../../components/ui/card";
import * as Forms from "../../components/ui/form";
import * as Text from "../../components/ui/text";
import { Toggle } from "../../settings/components/Toggle";
import * as Bridge from "../bridge";
import * as I18n from "../i18n";
import * as Island from "../island";
import * as Settings from "../settings";
import { setPluginActivity } from "./activity";
import { MARKETPLACE_CATALOG } from "./catalog";
import * as Registry from "./registry";
import { registerPlugin } from "./runtime";
import { useNavoPath } from "./useNavoPath";
import { useNavoPathConnection } from "./useNavoPathConnection";

/** Trusted executable plugins share the host framework; it is never copied into packages. */
export function ensurePluginSDK() {
	Object.assign(globalThis, {
		__ISLAND_PLUGIN_SDK__: {
			version: 1,
			React,
			JSX,
			Motion: { motion, AnimatePresence },
			Events,
			UI: { Buttons, Cards, Forms, Text, Toggle },
			Bridge,
			I18n,
			Island,
			Settings,
			Registry,
			getCatalog: () => [
				...MARKETPLACE_CATALOG,
				...Registry.getInstalledPlugins()
					.filter((p) => !MARKETPLACE_CATALOG.some((m) => m.id === p.manifest.id))
					.map((p) => p.manifest),
			],
			hooks: { useNavoPath, useNavoPathConnection },
			assets: { navopath },
			registerPlugin,
			setPluginActivity,
		},
	});
}

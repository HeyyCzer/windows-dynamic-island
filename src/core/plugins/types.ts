import type { MessageKey } from "../i18n";

export type PluginCategory = "productivity" | "media" | "tools" | "developer" | "system" | "social";

export interface PluginSettingField {
	key: string;
	label: string;
	description?: string;
	type: "text" | "number" | "boolean" | "select" | "password";
	options?: { label: string; value: string }[];
	default: unknown;
}

export interface PluginManifest {
	sdkVersion?: number;
	packageUrl?: string;
	sha256?: string;
	packageSize?: number;
	guide?: PluginGuide;
	id: string;
	name: string;
	titleKey?: MessageKey;
	descKey?: MessageKey;
	version: string;
	description: string;
	author: {
		name: string;
		url?: string;
	};
	category: PluginCategory;
	icon: string; // Lucide icon name or emoji or SVG
	accentColor?: string;
	homepage?: string;
	repository?: string;
	downloadUrl?: string;
	settings?: PluginSettingField[];
	permissions?: string[];
	tags?: string[];
	expandedSize?: {
		width: number;
		height: number;
	};
}

export interface InstalledPlugin {
	packageSha256?: string;
	manifest: PluginManifest;
	installedAt: number;
	enabled: boolean;
	customSettings: Record<string, unknown>;
	source: "marketplace" | "local" | "dev";
}

export interface PluginGuide {
	summary: string;
	prerequisites?: string[];
	steps: { title: string; desc: string; tip?: string; link?: { url: string; label: string } }[];
	features?: string[];
	faq?: { q: string; a: string }[];
}

export interface PluginPackage {
	formatVersion: 1;
	manifest: PluginManifest;
	code: string;
	css: string;
}

export interface LoadedPluginPackage extends Omit<PluginPackage, "formatVersion"> {
	sha256: string;
}

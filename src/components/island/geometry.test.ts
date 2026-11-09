import { describe, expect, test } from "bun:test";
import type { Appearance } from "../../core/appearance";
import { geometry, MAX_HEIGHT, variantOf } from "./geometry";

const look = { style: "dynamic" } as Appearance;
const v = variantOf(look);

describe("geometry", () => {
	test("expanded island keeps the module's size plus the tab bar", () => {
		expect(geometry(v, look, "expanded", { width: 620, height: 300 }, undefined).height).toBe(300 + v.tabBar);
	});

	test("a module taller than the window is clamped so its corners stay visible", () => {
		// AI Agents with several agents, the usage chart and four sessions asks for 464 + tab bar.
		const g = geometry(v, look, "expanded", { width: 620, height: 900 }, undefined);
		expect(g.height).toBe(MAX_HEIGHT);
	});

	test("peek has no tab bar and is clamped too", () => {
		expect(geometry(v, look, "peek", { width: 560, height: 200 }, undefined).height).toBe(200);
		expect(geometry(v, look, "peek", { width: 560, height: 900 }, undefined).height).toBe(MAX_HEIGHT);
	});
});

import { describe, expect, test } from "bun:test";
import { openTrigger } from "./settings";

describe("openTrigger", () => {
	test("defaults to hover", () => {
		expect(openTrigger({})).toBe("hover");
	});

	test("keeps the old 'Expand on hover' switch turned off as click", () => {
		expect(openTrigger({ "island.expandOnHover": false })).toBe("click");
		expect(openTrigger({ "island.expandOnHover": true })).toBe("hover");
	});

	test("the new setting wins over the old switch", () => {
		expect(openTrigger({ "island.expandOnHover": false, "island.openOn": "hover" })).toBe("hover");
		expect(openTrigger({ "island.openOn": "click" })).toBe("click");
	});
});

import { describe, expect, test } from "bun:test";
import { pressed } from "./useIslandDrag";

describe("pressed", () => {
	// A press whose release went to another window keeps sending moves with no
	// buttons down: those must end the drag instead of moving the island.
	test("only the primary button counts", () => {
		expect(pressed(1)).toBe(true);
		expect(pressed(1 | 2)).toBe(true);
		expect(pressed(0)).toBe(false);
		expect(pressed(2)).toBe(false);
	});
});

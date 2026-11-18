import { describe, expect, test } from "bun:test";
import { tabWindow } from "./tabWindow";

describe("tabWindow", () => {
	test("few tabs never scroll", () => {
		expect(tabWindow(0, 5, 4, 6)).toBe(0);
		expect(tabWindow(3, 6, 5, 6)).toBe(0);
	});

	test("selecting inside the window keeps it still", () => {
		expect(tabWindow(0, 10, 2, 6)).toBe(0);
		expect(tabWindow(0, 10, 3, 6)).toBe(0);
	});

	test("the second-to-last visible tab becomes the third-to-last", () => {
		// Visible 0..5; tab 4 moves to slot 3, revealing tab 6.
		expect(tabWindow(0, 10, 4, 6)).toBe(1);
	});

	test("the last visible tab reveals two more", () => {
		expect(tabWindow(0, 10, 5, 6)).toBe(2);
	});

	test("going back left mirrors it", () => {
		// Visible 4..9; tab 5 is second, so it moves to slot 2.
		expect(tabWindow(4, 10, 5, 6)).toBe(3);
		expect(tabWindow(4, 10, 4, 6)).toBe(2);
	});

	test("the window stops at both ends", () => {
		expect(tabWindow(0, 10, 9, 6)).toBe(4);
		expect(tabWindow(4, 10, 0, 6)).toBe(0);
		expect(tabWindow(4, 10, 8, 6)).toBe(4);
	});

	test("selecting no module tab only clamps", () => {
		expect(tabWindow(3, 10, -1, 6)).toBe(3);
		expect(tabWindow(9, 10, -1, 6)).toBe(4);
	});

	test("a module removed while scrolled clamps the window", () => {
		expect(tabWindow(4, 7, 6, 6)).toBe(1);
	});
});

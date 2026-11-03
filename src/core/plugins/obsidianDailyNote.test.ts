import { expect, test } from "bun:test";
import { dailyNoteName, quickCaptureName } from "./obsidianDailyNote";

test("daily notes default to zero-padded local year-month-day", () => {
	expect(dailyNoteName(new Date(2026, 0, 3))).toBe("2026-01-03");
	expect(dailyNoteName(new Date(2026, 10, 3), "YYYY年MM月DD日")).toBe("2026年11月03日");
	expect(dailyNoteName(new Date(2026, 10, 3), "YYYY/MM/DD")).toBe("2026/11/03");
});
test("quick captures use the configured date format and keep a unique time suffix", () => {
	expect(quickCaptureName(new Date(2026, 10, 3, 20, 15, 22))).toBe("2026-11-03-20-15-22");
	expect(quickCaptureName(new Date(2026, 10, 3, 20, 15, 22), "YYYY_MM_DD")).toBe("2026_11_03-20-15-22");
});
test("daily names reject path traversal, absolute paths, unsupported tokens and invalid filenames", () => {
	for (const pattern of ["../YYYY", "/YYYY-MM-DD", "C:/YYYY", "YYYY:MM:DD", "YY-M-D", "YYYY\nMM"]) {
		expect(() => dailyNoteName(new Date(), pattern)).toThrow();
	}
});

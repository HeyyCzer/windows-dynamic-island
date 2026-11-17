import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Every .tsx file under `dir`. */
function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sources(path);
		return path.endsWith(".tsx") ? [path] : [];
	});
}

describe("Button", () => {
	// The shared Button is `type="button"` unless told otherwise, so a form's
	// primary button without `type="submit"` never sends its form: clicking
	// "Add" in the GitHub settings did nothing.
	test("the primary button of every form submits it", () => {
		const offenders: string[] = [];
		for (const file of sources(join(import.meta.dir, "../.."))) {
			const code = readFileSync(file, "utf-8");
			for (const form of code.match(/<form\b[\s\S]*?<\/form>/g) ?? []) {
				for (const button of form.match(/<Button\b[^>]*>/g) ?? []) {
					if (button.includes('variant="primary"') && !button.includes('type="submit"')) {
						offenders.push(`${file}: ${button}`);
					}
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});

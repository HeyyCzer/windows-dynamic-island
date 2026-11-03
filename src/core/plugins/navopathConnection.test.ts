import { expect, test } from "bun:test";
import { NAVOPATH_ENDPOINT, resolveNavoPathConnection } from "./navopathConnection";

test("a new user has no built-in credentials", () => {
	expect(resolveNavoPathConnection()).toEqual({ endpoint: NAVOPATH_ENDPOINT, token: "", source: "legacy" });
});
test("calendar and plugin resolve the same saved personal connection", () => {
	expect(
		resolveNavoPathConnection(
			{ token: " personal ", mcpEndpoint: " https://personal.example/mcp " },
			{
				"calendar.navopath.token": "old",
				"calendar.navopath.endpoint": "https://old.example/mcp",
			},
		),
	).toEqual({ endpoint: "https://personal.example/mcp", token: "personal", source: "plugin" });
});
test("explicit disconnect cannot resurrect old calendar credentials", () => {
	expect(resolveNavoPathConnection({ token: "" }, { "calendar.navopath.token": "old" }).token).toBe("");
});
test("legacy calendar credentials continue to work before migration", () => {
	expect(
		resolveNavoPathConnection(
			{},
			{ "calendar.navopath.token": "old", "calendar.navopath.endpoint": "https://old.example/mcp" },
		),
	).toEqual({ endpoint: "https://old.example/mcp", token: "old", source: "legacy" });
});

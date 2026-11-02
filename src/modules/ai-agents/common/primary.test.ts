import { describe, expect, test } from "bun:test";
import { pickPrimary } from "./primary";
import type { AgentDefinition, AgentSession, AgentSnapshot } from "./types";

const agent = (id: string) => ({ id, name: id, color: "#fff" }) as AgentDefinition;
const claude = agent("claude");
const codex = agent("codex");

const snapshot = (...lastEventAt: number[]): AgentSnapshot => ({
	available: true,
	limits: [],
	sessions: lastEventAt.map((at, i) => ({ id: `${i}`, title: "p", status: "idle", lastEventAt: at }) as AgentSession),
});

describe("pickPrimary", () => {
	test("falls back to the first agent without sessions", () => {
		expect(pickPrimary([claude, codex], [snapshot(), snapshot()])).toBe(claude);
	});

	// #17: only Codex was used, yet the island showed Claude's icon.
	test("picks Codex when only Codex has sessions", () => {
		expect(pickPrimary([claude, codex], [snapshot(), snapshot(1_000)])).toBe(codex);
	});

	test("picks the agent used most recently", () => {
		expect(pickPrimary([claude, codex], [snapshot(5_000), snapshot(1_000, 3_000)])).toBe(claude);
		expect(pickPrimary([claude, codex], [snapshot(2_000), snapshot(1_000, 3_000)])).toBe(codex);
	});
});

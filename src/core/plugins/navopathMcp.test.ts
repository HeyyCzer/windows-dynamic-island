import { afterEach, expect, test } from "bun:test";
import {
	callMcpTool,
	completeNavoPathTask,
	createNavoPathTask,
	fetchNavoPathSummary,
	fetchNavoPathTasks,
} from "./navopathMcp";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});
type Request = { id?: number; method: string; params?: { name: string; arguments: Record<string, unknown> } };
function rpc(body: Request, result: unknown, sse = false, headers?: HeadersInit) {
	const data = JSON.stringify({ jsonrpc: "2.0", id: body.id, result });
	return new Response(sse ? `event: message\ndata: ${data}\n\n` : data, { headers });
}
function tool(data: unknown) {
	return { content: [{ type: "text", text: JSON.stringify(data) }] };
}
function server(
	name: string,
	handler: (body: Request, init?: RequestInit) => Response | Promise<Response>,
	stateless = false,
) {
	const requests: Request[] = [];
	globalThis.fetch = (async (_url: string | URL | globalThis.Request, init?: RequestInit) => {
		const body: Request = JSON.parse(String(init?.body));
		requests.push(body);
		if (body.method === "initialize")
			return rpc(body, { protocolVersion: "2025-03-26" }, true, stateless ? {} : { "mcp-session-id": "session" });
		if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
		return handler(body, init);
	}) as unknown as typeof fetch;
	return { endpoint: `https://${name}.example/mcp`, requests };
}

test("concurrent reads share one initialization and use the negotiated protocol", async () => {
	const { endpoint, requests } = server("concurrent", (body, init) => {
		expect(new Headers(init?.headers).get("MCP-Protocol-Version")).toBe("2025-03-26");
		expect(new Headers(init?.headers).get("mcp-session-id")).toBe("session");
		return rpc(body, tool({ projects: 2, openTasks: 3, completedTasks: 4 }), true);
	});
	await Promise.all([fetchNavoPathSummary(endpoint, " token "), fetchNavoPathSummary(endpoint, "token")]);
	expect(requests.map((body) => body.method)).toEqual([
		"initialize",
		"notifications/initialized",
		"tools/call",
		"tools/call",
	]);
});

test("stateless MCP initialization does not require a session header", async () => {
	const { endpoint } = server(
		"stateless",
		(body, init) => {
			expect(new Headers(init?.headers).has("mcp-session-id")).toBe(false);
			return rpc(body, tool({ projects: 0, openTasks: 0, completedTasks: 0 }));
		},
		true,
	);
	expect((await fetchNavoPathSummary(endpoint, "token")).openTasks).toBe(0);
});

test("requests incomplete tasks using the production schema and limits locally", async () => {
	const { endpoint } = server("tasks", (body) => {
		expect(body.params?.arguments).toEqual({ completed: false });
		return rpc(
			body,
			tool([
				{ id: "done", title: "Done", completed: true },
				{ id: "1", title: "One" },
				{ id: "2", title: "Two" },
			]),
		);
	});
	expect(await fetchNavoPathTasks(endpoint, "token", 1)).toEqual([{ id: "1", title: "One" }]);
});

test("creates with an idempotency key and completes with supported patch fields", async () => {
	const { endpoint, requests } = server("mutations", (body) => rpc(body, tool({ id: "task", title: "New" })));
	await createNavoPathTask(endpoint, "token", "New");
	await completeNavoPathTask(endpoint, "token", "task");
	const calls = requests.filter((body) => body.method === "tools/call");
	expect(calls[0].params?.arguments).toMatchObject({ title: "New" });
	expect(calls[0].params?.arguments.idempotency_key).toMatch(/^island-.{36}$/);
	expect(calls[1].params?.arguments).toEqual({ taskId: "task", patch: { completed: true } });
});

test("propagates JSON-RPC and tool errors instead of treating them as success", async () => {
	const a = server(
		"rpc-error",
		(body) => new Response(JSON.stringify({ id: body.id, error: { code: -32602, message: "Invalid params" } })),
	);
	await expect(callMcpTool(a.endpoint, "token", "create_task")).rejects.toThrow("Invalid params");
	const b = server("tool-error", (body) =>
		rpc(body, { isError: true, content: [{ type: "text", text: "Task not found" }] }),
	);
	await expect(completeNavoPathTask(b.endpoint, "token", "missing")).rejects.toThrow("Task not found");
});

test("SSE matches response IDs and supports multiline data plus notifications", async () => {
	const { endpoint } = server(
		"sse",
		(body) =>
			new Response(
				`: keepalive\r\n\r\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\r\n\r\ndata: {"jsonrpc":"2.0","id":${body.id},\r\ndata: "result":{"structuredContent":{"ok":true}}}\r\n\r\n`,
			),
	);
	expect(await callMcpTool<{ ok: boolean }>(endpoint, "token", "read")).toEqual({ ok: true });
});

test("expired session reinitializes exactly once", async () => {
	let calls = 0;
	const { endpoint, requests } = server("expired", (body) =>
		++calls === 1 ? new Response(null, { status: 404 }) : rpc(body, tool([])),
	);
	expect(await fetchNavoPathTasks(endpoint, "token")).toEqual([]);
	expect(requests.filter((body) => body.method === "initialize")).toHaveLength(2);
});

test("failed writes are never replayed on network errors or server errors", async () => {
	const a = server("network", () => {
		throw new TypeError("Failed to fetch");
	});
	await expect(createNavoPathTask(a.endpoint, "token", "New")).rejects.toThrow("Failed to fetch");
	expect(a.requests.filter((body) => body.method === "tools/call")).toHaveLength(1);
	const b = server("server", () => new Response(null, { status: 500 }));
	await expect(createNavoPathTask(b.endpoint, "token", "New")).rejects.toThrow("500");
	expect(b.requests.filter((body) => body.method === "tools/call")).toHaveLength(1);
});

test("an HTTP authentication failure in initialization is reported and retryable", async () => {
	globalThis.fetch = (async () => new Response(null, { status: 401 })) as unknown as typeof fetch;
	await expect(fetchNavoPathSummary("https://auth.example/mcp", "token")).rejects.toThrow("401");
	const { endpoint } = server("auth", (body) => rpc(body, tool({ projects: 0, openTasks: 0, completedTasks: 0 })));
	expect((await fetchNavoPathSummary(endpoint, "token")).projects).toBe(0);
});

test("malformed tool data cannot create a false connected or empty state", async () => {
	const { endpoint } = server("invalid", (body) => rpc(body, tool({ error: "bad payload" })));
	await expect(fetchNavoPathSummary(endpoint, "token")).rejects.toThrow("invalid workspace summary");
	await expect(fetchNavoPathTasks(endpoint, "token")).rejects.toThrow("invalid task list");
	await expect(createNavoPathTask(endpoint, "token", "New")).rejects.toThrow("invalid task");
});

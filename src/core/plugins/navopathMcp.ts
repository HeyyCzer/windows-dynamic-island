import { version } from "../../../package.json";
import { command, isTauri } from "../bridge";

/** Streamable HTTP MCP client shared by the widget, calendar and diagnostics. */
export interface NavoPathTask {
	id: string;
	title: string;
	dueDate?: string;
	priority?: string;
	urgency?: string;
	workflowStatus?: string;
	completed?: boolean;
	estimatedHours?: number;
	plannedForDate?: string;
	timelineRecords?: {
		scheduledDate: string;
		scheduledEndDate?: string;
		scheduledStart: string;
		executionStatus: string;
	}[];
}

export interface NavoPathSummary {
	projects: number;
	openTasks: number;
	completedTasks: number;
}

interface McpSession {
	sessionId: string | null;
	protocolVersion: string;
	initializedAt: number;
}

interface RpcResponse {
	id?: number;
	result?: {
		protocolVersion?: string;
		isError?: boolean;
		structuredContent?: unknown;
		content?: { type: string; text?: string }[];
	};
	error?: { message: string };
}

let current: { endpoint: string; token: string; session: Promise<McpSession> } | null = null;
let reqCounter = 1;

// SSE can contain notifications before the response and multiple data lines per event.
function parseResponse(raw: string, id: number): RpcResponse {
	const messages: RpcResponse[] = [];
	if (raw.trimStart().startsWith("{")) {
		messages.push(JSON.parse(raw));
	} else {
		for (const event of raw.replaceAll("\r\n", "\n").split(/\n\n+/)) {
			const data = event
				.split("\n")
				.filter((line) => line.startsWith("data:"))
				.map((line) => line.slice(5).trimStart())
				.join("\n");
			if (data) messages.push(JSON.parse(data));
		}
	}
	const response = messages.find((message) => message.id === id);
	if (!response) throw new Error("MCP returned no matching response");
	if (response.error) throw new Error(response.error.message);
	if (!response.result) throw new Error("MCP returned an invalid result");
	return response;
}

async function post(endpoint: string, token: string, body: object, session?: McpSession) {
	if (isTauri) {
		const native = await command<{ status: number; sessionId: string | null; body: string }>("navopath_mcp_request", {
			endpoint,
			token,
			body,
			sessionId: session?.sessionId ?? null,
			protocolVersion: session?.protocolVersion ?? null,
		});
		return {
			response: new Response(null, {
				status: native.status,
				headers: native.sessionId ? { "mcp-session-id": native.sessionId } : {},
			}),
			raw: native.body,
		};
	}
	const response = await fetch(endpoint, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			...(session?.sessionId ? { "mcp-session-id": session.sessionId } : {}),
			...(session ? { "MCP-Protocol-Version": session.protocolVersion } : {}),
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(20000),
	});
	const raw = await response.text();
	return { response, raw };
}

function checkStatus(response: Response) {
	if (!response.ok) throw new Error(`MCP HTTP ${response.status}`);
}

async function initialize(endpoint: string, token: string): Promise<McpSession> {
	const id = reqCounter++;
	const { response, raw } = await post(endpoint, token, {
		jsonrpc: "2.0",
		id,
		method: "initialize",
		params: {
			protocolVersion: "2025-03-26",
			capabilities: {},
			clientInfo: { name: "windows-dynamic-island", version },
		},
	});
	checkStatus(response);
	const result = parseResponse(raw, id).result;
	if (!result?.protocolVersion) throw new Error("MCP initialization failed");
	const session = {
		sessionId: response.headers.get("mcp-session-id"),
		protocolVersion: result.protocolVersion,
		initializedAt: Date.now(),
	};
	// Stateless servers may omit the session header; initialization is still valid.
	const initialized = await post(endpoint, token, { jsonrpc: "2.0", method: "notifications/initialized" }, session);
	checkStatus(initialized.response);
	return session;
}

async function getSession(endpoint: string, token: string) {
	if (!current || current.endpoint !== endpoint || current.token !== token) {
		current = { endpoint, token, session: initialize(endpoint, token) };
	}
	const pending = current;
	try {
		const session = await pending.session;
		if (Date.now() - session.initializedAt < 30 * 60 * 1000) return session;
		if (current === pending) current = null;
		return getSession(endpoint, token);
	} catch (error) {
		if (current === pending) current = null;
		throw error;
	}
}

export async function callMcpTool<T>(
	endpoint: string,
	token: string,
	toolName: string,
	args: Record<string, unknown> = {},
): Promise<T> {
	const url = endpoint.trim();
	const credential = token.trim();
	if (!credential) throw new Error("MCP token is required");
	for (let attempt = 0; attempt < 2; attempt++) {
		const session = await getSession(url, credential);
		const id = reqCounter++;
		const { response, raw } = await post(
			url,
			credential,
			{ jsonrpc: "2.0", id, method: "tools/call", params: { name: toolName, arguments: args } },
			session,
		);
		// Only a missing session guarantees the tool was not executed. Never replay a
		// mutation after a network failure or a generic server/tool error.
		if (response.status === 404 && session.sessionId && attempt === 0) {
			if (current?.endpoint === url && current.token === credential) current = null;
			continue;
		}
		checkStatus(response);
		const result = parseResponse(raw, id).result;
		const text = result?.content?.find((item) => item.type === "text")?.text;
		if (result?.isError) throw new Error(text || "MCP tool failed");
		if (result?.structuredContent !== undefined) return result.structuredContent as T;
		if (text === undefined) throw new Error("MCP returned no tool data");
		return JSON.parse(text) as T;
	}
	throw new Error("MCP session expired");
}

export async function fetchNavoPathSummary(endpoint: string, token: string): Promise<NavoPathSummary> {
	const summary = await callMcpTool<NavoPathSummary>(endpoint, token, "get_workspace_summary");
	if (![summary?.projects, summary?.openTasks, summary?.completedTasks].every(Number.isFinite)) {
		throw new Error("MCP returned an invalid workspace summary");
	}
	return summary;
}

export async function fetchNavoPathTasks(endpoint: string, token: string, limit = 10): Promise<NavoPathTask[]> {
	const tasks = await callMcpTool<NavoPathTask[]>(endpoint, token, "list_tasks", { completed: false });
	if (!Array.isArray(tasks) || tasks.some((task) => typeof task.id !== "string" || typeof task.title !== "string")) {
		throw new Error("MCP returned an invalid task list");
	}
	return tasks.filter((task) => !task.completed).slice(0, limit);
}

export async function createNavoPathTask(endpoint: string, token: string, title: string): Promise<NavoPathTask> {
	const task = await callMcpTool<NavoPathTask>(endpoint, token, "create_task", {
		title,
		idempotency_key: `island-${crypto.randomUUID()}`,
	});
	if (typeof task?.id !== "string" || typeof task.title !== "string") throw new Error("MCP returned an invalid task");
	return task;
}

export async function completeNavoPathTask(endpoint: string, token: string, taskId: string): Promise<unknown> {
	return callMcpTool(endpoint, token, "update_task", { taskId, patch: { completed: true } });
}

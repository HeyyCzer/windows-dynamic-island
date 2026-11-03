import { useCallback, useEffect, useMemo } from "react";
import { createStore } from "../island";
import {
	completeNavoPathTask,
	createNavoPathTask,
	fetchNavoPathSummary,
	fetchNavoPathTasks,
	type NavoPathSummary,
	type NavoPathTask,
} from "./navopathMcp";

interface Workspace {
	summary: NavoPathSummary | null;
	tasks: NavoPathTask[];
	loading: boolean;
	error: string | null;
	adding: boolean;
	completingId: string | null;
	updatedAt: number;
}

function newConnection(endpoint: string, token: string) {
	return {
		endpoint,
		token,
		version: 0,
		pending: null as Promise<void> | null,
		store: createStore<Workspace>({
			summary: null,
			tasks: [],
			loading: false,
			error: null,
			adding: false,
			completingId: null,
			updatedAt: 0,
		}),
	};
}

// Retain only the active account in memory; changing credentials drops its cache.
let active: ReturnType<typeof newConnection> | null = null;
function connectionFor(endpoint: string, token: string) {
	if (!active || active.endpoint !== endpoint || active.token !== token) active = newConnection(endpoint, token);
	return active;
}

export function useNavoPath(endpoint: string, token: string, enabled = true, limit = 10) {
	const connection = useMemo(() => connectionFor(endpoint, token), [endpoint, token]);
	const state = connection.store.use();
	const loadData = useCallback(async () => {
		const current = connection.store.get();
		if (!enabled || !token || current.adding || current.completingId) return;
		if (connection.pending) return connection.pending;
		const request = ++connection.version;
		connection.store.set({ ...current, loading: true });
		connection.pending = (async () => {
			try {
				// Both views share the full workspace; the widget limits its display only.
				const [summary, tasks] = await Promise.all([
					fetchNavoPathSummary(endpoint, token),
					fetchNavoPathTasks(endpoint, token, Number.MAX_SAFE_INTEGER),
				]);
				if (request === connection.version)
					connection.store.set((previous) => ({
						...previous,
						summary,
						tasks,
						loading: false,
						error: null,
						updatedAt: Date.now(),
					}));
			} catch (cause) {
				if (request === connection.version)
					connection.store.set((previous) => ({ ...previous, loading: false, error: String(cause) }));
			} finally {
				connection.pending = null;
			}
		})();
		return connection.pending;
	}, [connection, enabled, endpoint, token]);

	useEffect(() => {
		if (!enabled || !token) return;
		const current = connection.store.get();
		if (current.error || Date.now() - current.updatedAt >= 60000) void loadData();
		const interval = setInterval(() => void loadData(), 60000);
		window.addEventListener("online", loadData);
		return () => {
			clearInterval(interval);
			window.removeEventListener("online", loadData);
		};
	}, [connection, enabled, token, loadData]);

	const mutate = async (action: () => Promise<unknown>, taskId?: string) => {
		const current = connection.store.get();
		if (!enabled || !token || current.adding || current.completingId) return false;
		++connection.version;
		connection.store.set({ ...current, loading: false, adding: !taskId, completingId: taskId || null });
		try {
			const result = await action();
			connection.store.set((previous) => ({
				...previous,
				tasks: taskId
					? previous.tasks.filter((task) => task.id !== taskId)
					: [result as NavoPathTask, ...previous.tasks],
				summary: previous.summary
					? {
							...previous.summary,
							openTasks: Math.max(0, previous.summary.openTasks + (taskId ? -1 : 1)),
							completedTasks: previous.summary.completedTasks + (taskId ? 1 : 0),
						}
					: null,
				adding: false,
				completingId: null,
				error: null,
				updatedAt: Date.now(),
			}));
			// A read that began before the mutation cannot overwrite its result.
			void (connection.pending ?? Promise.resolve()).then(loadData);
			return true;
		} catch (cause) {
			connection.store.set((previous) => ({ ...previous, adding: false, completingId: null, error: String(cause) }));
			return false;
		}
	};

	return {
		...state,
		tasks: state.tasks.slice(0, limit),
		loadData,
		addTask: (title: string) => mutate(() => createNavoPathTask(endpoint, token, title)),
		completeTask: (id: string) => mutate(() => completeNavoPathTask(endpoint, token, id), id),
	};
}

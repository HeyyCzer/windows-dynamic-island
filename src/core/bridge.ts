/**
 * Frontend side of the provider hub (see `src-tauri/src/hub.rs`).
 *
 * Every provider publishes its state under an id; `useProvider(id)` returns the
 * latest value and re-renders on change. Outside Tauri (plain `bun run dev` in a
 * browser) a mock feed is used so the UI can be designed without the backend;
 * it's dev-only, so release builds leave it out.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef, useSyncExternalStore } from "react";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type Listener = () => void;
const state = new Map<string, unknown>();
const listeners = new Set<Listener>();
const localEvents = new Map<string, Set<(payload: unknown) => void>>();

function notify() {
	for (const l of listeners) l();
}

function subscribe(listener: Listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** Set a provider's state locally (used by the browser mock). */
export function publishLocal(id: string, data: unknown) {
	state.set(id, data);
	notify();
}

/** Emit an event locally (used by the browser mock). */
export function emitLocal(event: string, payload: unknown) {
	for (const h of localEvents.get(event) ?? []) h(payload);
}

type LocalCall = (target: "provider" | "command", id: string, name: string, payload: unknown) => unknown;
let localCall: LocalCall | undefined;

/** Answer `providerAction`/`command` outside Tauri (used by the browser mock). */
export function handleLocalCalls(handler: LocalCall) {
	localCall = handler;
}

let started = false;
export async function startBridge() {
	if (started) return;
	started = true;

	if (!isTauri) {
		if (import.meta.env.DEV) (await import("../dev/mock")).startMock();
		return;
	}

	await listen<{ id: string; data: unknown }>("provider://update", (e) => {
		state.set(e.payload.id, e.payload.data);
		notify();
	});
	const snapshot = await invoke<Record<string, unknown>>("get_snapshot");
	for (const [id, data] of Object.entries(snapshot)) {
		if (!state.has(id)) state.set(id, data);
	}
	notify();
}

/** A provider's latest state outside React. */
export const getProvider = <T>(id: string) => state.get(id) as T | undefined;
/** Called whenever any provider publishes; returns the unsubscribe. */
export const subscribeProviders = (listener: Listener) => subscribe(listener);

export function useProvider<T>(id: string): T | undefined {
	return useSyncExternalStore(subscribe, () => state.get(id) as T | undefined);
}

export function providerAction<T = unknown>(id: string, action: string, payload?: unknown) {
	if (!isTauri) return Promise.resolve(localCall?.("provider", id, action, payload) as T);
	return invoke<T>("provider_action", { id, action, payload: payload ?? null });
}

export function command<T = unknown>(cmd: string, args?: Record<string, unknown>) {
	if (!isTauri) return Promise.resolve(localCall?.("command", "", cmd, args) as T);
	return invoke<T>(cmd, args);
}

/** Subscribe to a backend event outside React (local events in the browser mock). */
export function onEvent<T>(event: string, handler: (payload: T) => void): () => void {
	const h = (p: unknown) => handler(p as T);
	if (!isTauri) {
		const set = localEvents.get(event) ?? new Set();
		set.add(h);
		localEvents.set(event, set);
		return () => void set.delete(h);
	}
	let unlisten: UnlistenFn | undefined;
	let disposed = false;
	listen<T>(event, (e) => h(e.payload)).then((fn) => {
		if (disposed) fn();
		else unlisten = fn;
	});
	return () => {
		disposed = true;
		unlisten?.();
	};
}

/** Subscribe to a backend event for the component's lifetime. */
export function useTauriEvent<T>(event: string, handler: (payload: T) => void) {
	const ref = useRef(handler);
	ref.current = handler;

	useEffect(() => {
		const h = (p: unknown) => ref.current(p as T);
		if (!isTauri) {
			const set = localEvents.get(event) ?? new Set();
			set.add(h);
			localEvents.set(event, set);
			return () => void set.delete(h);
		}
		let unlisten: UnlistenFn | undefined;
		let disposed = false;
		listen<T>(event, (e) => h(e.payload)).then((fn) => {
			if (disposed) fn();
			else unlisten = fn;
		});
		return () => {
			disposed = true;
			unlisten?.();
		};
	}, [event]);
}

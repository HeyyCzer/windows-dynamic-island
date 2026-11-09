/**
 * Island plugin SDK v1 runtime.
 *
 * The app injects this script first into every HTML page of a plugin (and
 * into the page it makes for a background script), so `window.island` is
 * there before the plugin's own code runs. It talks to the island with
 * `postMessage`; the island knows which plugin a message comes from by the
 * frame that sent it, never by anything in the message.
 *
 * Types: `@windows-island/plugin-sdk` (packages/plugin-sdk/index.d.ts).
 */
(() => {
	const SDK = "1.0";
	const PROTOCOL = 1;

	if (window.parent === window) {
		console.warn("[island] this page is meant to run inside the island");
	}

	// The sandbox has no network (CSP `connect-src 'none'`), but CSP doesn't
	// cover WebRTC: take it away so `net.fetch` stays the only way out.
	for (const name of ["RTCPeerConnection", "webkitRTCPeerConnection", "RTCDataChannel", "RTCSessionDescription"]) {
		try {
			Object.defineProperty(window, name, { value: undefined, configurable: false, writable: false });
		} catch {
			/* not there */
		}
	}

	let nextCall = 1;
	const pending = new Map();
	const queue = [];
	const listeners = new Map();
	let initialized = false;
	let info = {
		sdk: SDK,
		plugin: { id: "", version: "" },
		context: "background",
		module: null,
		locale: "en",
		messages: {},
		settings: {},
		state: null,
	};

	const post = (message) => window.parent.postMessage({ island: PROTOCOL, ...message }, "*");

	/** Calls a host method; resolves with its result. */
	function call(method, params) {
		return new Promise((resolve, reject) => {
			const id = nextCall++;
			pending.set(id, { resolve, reject });
			const message = { type: "call", id, method, params: params ?? null };
			if (initialized) post(message);
			else queue.push(message);
		});
	}

	/**
	 * Events that started (or waited for) this background, held until someone
	 * listens: the plugin's code subscribes after `await island.ready` and
	 * maybe other awaits, and the event that woke it shouldn't be lost.
	 */
	const held = [];

	function on(name, callback) {
		let set = listeners.get(name);
		if (!set) {
			set = new Set();
			listeners.set(name, set);
		}
		set.add(callback);
		if (held.some((h) => h.name === name)) {
			queueMicrotask(() => {
				for (let i = 0; i < held.length; ) {
					if (held[i].name === name) emit(name, held.splice(i, 1)[0].data);
					else i++;
				}
			});
		}
		return () => set.delete(callback);
	}

	function emit(name, data) {
		for (const callback of listeners.get(name) ?? []) {
			try {
				callback(data);
			} catch (e) {
				console.error(`[island] ${name} listener failed`, e);
			}
		}
	}

	let resolveReady;
	const ready = new Promise((resolve) => {
		resolveReady = resolve;
	});

	window.addEventListener("message", (e) => {
		// Only the island (our parent) speaks to us.
		if (e.source !== window.parent) return;
		const msg = e.data;
		if (!msg || msg.island !== PROTOCOL) return;
		switch (msg.type) {
			case "init":
				info = { ...info, ...msg.data };
				initialized = true;
				for (const queued of queue.splice(0)) post(queued);
				resolveReady(island);
				break;
			case "result": {
				const call = pending.get(msg.id);
				if (!call) return;
				pending.delete(msg.id);
				if (msg.ok) call.resolve(msg.value);
				else call.reject(new Error(msg.error ?? "failed"));
				break;
			}
			case "event":
				if (msg.name === "locale") {
					info.locale = msg.data.locale;
					info.messages = msg.data.messages;
				} else if (msg.name === "settings") {
					info.settings = msg.data;
				} else if (msg.name === "state") {
					info.state = msg.data;
				}
				{
					const data = msg.name === "locale" ? msg.data.locale : msg.data;
					if (msg.queued && !listeners.get(msg.name)?.size) held.push({ name: msg.name, data });
					else emit(msg.name, data);
				}
				break;
		}
	});

	/** `{name}` placeholders, as in the app's own strings. */
	function t(key, vars) {
		const text = info.messages[key] ?? key;
		return vars ? text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : text;
	}

	function decodeBase64(body) {
		const binary = atob(body);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return bytes;
	}

	function encodeBase64(bytes) {
		let binary = "";
		for (const b of bytes) binary += String.fromCharCode(b);
		return btoa(binary);
	}

	/** Like `fetch`, through the app (only hosts granted with `network:<host>`). */
	async function fetchVia(url, init = {}) {
		let body = init.body;
		let bodyBase64 = false;
		if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
			body = encodeBase64(new Uint8Array(body instanceof ArrayBuffer ? body : body.buffer));
			bodyBase64 = true;
		} else if (body !== undefined && body !== null && typeof body !== "string") {
			body = JSON.stringify(body);
		}
		const headers =
			init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : { ...(init.headers ?? {}) };
		const res = await call("net.fetch", {
			url: String(url),
			method: init.method ?? "GET",
			headers,
			body: body ?? null,
			bodyBase64,
		});
		const bytes = decodeBase64(res.body);
		return {
			status: res.status,
			ok: res.status >= 200 && res.status < 300,
			url: res.url,
			headers: res.headers,
			text: async () => new TextDecoder().decode(bytes),
			json: async () => JSON.parse(new TextDecoder().decode(bytes)),
			bytes: async () => bytes,
			arrayBuffer: async () => bytes.buffer,
		};
	}

	const island = Object.freeze({
		sdk: SDK,
		ready,
		get plugin() {
			return info.plugin;
		},
		/** `"background"` or `"panel"`. */
		get context() {
			return info.context;
		},
		/** The module a panel belongs to (`null` in the background). */
		get module() {
			return info.module;
		},
		get locale() {
			return info.locale;
		},
		t,
		onLocaleChange: (callback) => on("locale", callback),

		/** What a module shows in the island when it isn't open. */
		setView: (module, view) => call("view.set", { module, view }),

		/** State shared by the plugin's background and panels. */
		state: Object.freeze({
			get: () => info.state,
			set(value) {
				info.state = value;
				emit("state", value);
				return call("state.set", { value });
			},
			subscribe: (callback) => on("state", callback),
		}),

		/** The plugin's settings (declared in plugin.json). */
		settings: Object.freeze({
			get: (key) => info.settings[key],
			all: () => ({ ...info.settings }),
			set: (key, value) => call("settings.set", { key, value }),
			subscribe: (callback) => on("settings", callback),
		}),

		/** Persistent key/value storage of the plugin's own (1 MB). */
		storage: Object.freeze({
			get: (key) => call("storage", { op: "get", key }),
			set: (key, value) => call("storage", { op: "set", key, value }),
			remove: (key) => call("storage", { op: "remove", key }),
			keys: () => call("storage", { op: "keys" }),
			clear: () => call("storage", { op: "clear" }),
		}),

		/** Opens the island, on one of this plugin's modules if given. */
		expand: (module) => call("island.expand", { module: module ?? null }),
		collapse: () => call("island.collapse"),
		/** Gives the island the keyboard (for a text field in a panel). */
		focus: () => call("island.focus"),

		/** A global shortcut declared in plugin.json was pressed. */
		onShortcut: (callback) => on("shortcut", callback),

		/** Timers kept by the island: they fire (and start the background) while it's stopped. */
		alarms: Object.freeze({
			create: (name, options) =>
				call("alarms.create", { name: String(name), delay: options?.delay ?? null, every: options?.every ?? null }),
			clear: (name) => call("alarms.clear", { name: String(name) }),
			clearAll: () => call("alarms.clearAll"),
			list: () => call("alarms.list"),
		}),
		onAlarm: (callback) => on("alarm", callback),

		net: Object.freeze({ fetch: fetchVia }),
		clipboard: Object.freeze({
			readText: () => call("clipboard.read"),
			writeText: (text) => call("clipboard.write", { text: String(text) }),
		}),
		fs: Object.freeze({
			readText: (path) => call("fs.readText", { path: String(path) }),
		}),
		openUrl: (url) => call("openUrl", { url: String(url) }),

		/** Built-in providers' state (`provider:<id>` permission). */
		providers: Object.freeze({
			get: (id) => call("providers.get", { id }),
			subscribe(id, callback) {
				call("providers.subscribe", { id }).catch((e) => console.error("[island]", e));
				return on(`provider:${id}`, callback);
			},
		}),
	});

	Object.defineProperty(window, "island", { value: island, enumerable: true });
	post({ type: "hello", sdk: SDK });
})();

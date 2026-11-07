# SDK reference (v1)

The app injects the SDK into every HTML page of your plugin, ahead of your own scripts, as the global `island`. For types, add the package (or copy `packages/plugin-sdk/index.d.ts`):

```ts
/// <reference types="@windows-island/plugin-sdk" />
// or: import { island } from "@windows-island/plugin-sdk";
```

The SDK also injects a small stylesheet with the island's look: dark color scheme, the island's font, a transparent background, CSS variables (`--island-text`, `--island-text-dim`, `--island-accent`, `--island-card`, `--island-radius`…) and a few opt-in classes (`.island-button`, `.island-card`, `.island-dim`). Your own CSS loads after it and wins.

## Lifecycle

```js
await island.ready; // the island answered: locale, settings and state are filled in
```

Calls made before that are queued. `island.context` is `"background"` or `"panel"`, and `island.module` is the panel's module id (`null` in the background). A panel is created when its tab opens and destroyed when it closes, so keep anything that has to survive in the background, in `island.state` or in `island.storage`.

## View: what the island shows while it's closed

```js
island.setView("timer", {
  active: true,             // wants the compact island
  priority: 60,             // 0–100; higher wins the main slot (default 50)
  compact: {
    left: [{ icon: "icons/tomato.svg" }, { text: "Focus", bold: true }],
    right: { text: "12:34", mono: true, color: "#ff6b63" },
    width: 260,             // 180–420 px
  },
  ambient: { text: "3" },   // small bubble left of the island, even when not active
  icon: "icons/tomato.svg", // tab bar / side bubble icon
  accent: "#ff6b63",        // tab ring color (Windows Island style)
  activityKey: "done:42",   // changing it opens the island on this module briefly
  attention: true,          // opening the island goes to this module
  hidden: false,            // leave it out of the tab bar for now
});
island.setView("timer", null); // back to nothing
```

A *segment* is a string or `{ text, icon, color, bold, mono, dim }`, and `left`/`right` take one or a list (up to 4). Icons are paths in your package. Colors are `#rgb`, `#rrggbb`, `#rrggbbaa` or `rgb()`/`rgba()`. Anything else is dropped. The island only draws compact content while `active` is set. For reference, built-in modules use 30 (notifications), 50 (music playing), 60 (an AI agent working), 75 (just copied) and 90 (an AI agent waiting on you).

## State shared by your pages

```js
island.state.set({ running: true, endsAt: Date.now() + 25 * 60_000 });
island.state.get();                       // the latest value
const off = island.state.subscribe((s) => render(s)); // fires on changes from any page
```

State is in memory and per plugin: the background and every open panel see the same value. It's gone when the plugin stops (app restart, plugin turned off or updated). Limit: 256 KB as JSON.

## Settings

```js
island.settings.get("work");            // 25 (default from plugin.json until changed)
island.settings.all();
island.settings.subscribe((all) => …);  // the user changed something
await island.settings.set("work", 30);  // validated against plugin.json
```

## Storage

Persistent, private to the plugin, JSON values, 1 MB in total. Removed with the plugin.

```js
await island.storage.set("history", [1, 2, 3]);
await island.storage.get("history"); // [1, 2, 3], or null
await island.storage.remove("history");
await island.storage.keys();
await island.storage.clear();
```

## The island

```js
await island.expand("timer"); // open on one of your modules (or the current tab, without an id)
await island.collapse();
await island.focus();         // panels only: take the keyboard, for text fields
```

## Shortcuts

```js
island.onShortcut((id) => {
  if (id === "toggle") toggle();
});
```

`id` is a shortcut's `id` from `plugin.json`. Every page of the plugin gets the event, so handle it in one place (usually the background).

## Translations

```js
island.locale;                        // "pt-BR"
island.t("timer.left", { minutes: 5 });
island.onLocaleChange((locale) => rerender());
```

## Network: `network:<host>`

```js
const res = await island.net.fetch("https://api.github.com/repos/HeyyCzer/windows-island", {
  headers: { Accept: "application/vnd.github+json" },
});
if (res.ok) console.log((await res.json()).stargazers_count);
```

It works like `fetch`, with some differences: HTTPS only; only hosts you declared; redirects aren't followed (you get the 3xx response, so follow it yourself if the new host is allowed); no cookies; responses up to 10 MB. `body` takes a string, bytes or any JSON-serializable value. The response has `status`, `ok`, `url`, `headers`, plus `text()`, `json()`, `bytes()` and `arrayBuffer()`.

## Clipboard: `clipboard:read`, `clipboard:write`

```js
await island.clipboard.writeText("copied!");
await island.clipboard.readText(); // string, or null when it isn't text
```

Content that password managers mark as private reads as `null`.

## Files: `fs:read:<pattern>`

```js
const text = await island.fs.readText("$HOME/.config/my-tool/state.json");
```

Paths may start with `$HOME`, `$APPDATA`, `$LOCALAPPDATA` or `$DOCUMENTS`, or be absolute. Text files only, up to 5 MB. Links are resolved before checking the pattern.

## Opening links: `open-url`

```js
await island.openUrl("https://example.com"); // https only, in the default browser
```

## Built-in providers: `provider:<id>`

Read what some built-in modules see: `music` (the current media session) and `monitor` (CPU, memory, GPU).

```js
const music = await island.providers.get("music");
const off = island.providers.subscribe("music", (state) => render(state));
```

Their shapes follow the app's own (`src-tauri/src/providers/<id>/`). They're not part of the SDK's versioning yet, so check fields before using them.

## Errors

Every call returns a promise that rejects with an `Error` when the island refuses (missing permission, bad value) or the operation fails. The message says why.

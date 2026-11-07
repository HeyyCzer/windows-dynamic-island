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

Calls made before that are queued. `island.context` is `"background"` or `"panel"`, and `island.module` is the panel's module id (`null` in the background). A panel is created when its tab opens and destroyed when it closes. Unless it's [persistent](manifest.md#background-on-demand-or-persistent), the background also comes and goes: it's started for an event and stopped when idle. Keep anything that has to survive in `island.state` or `island.storage`.

An on-demand background runs its script from the top every time it starts. Register your listeners (`onAlarm`, `onShortcut`, `state.subscribe`…) on every run: the event that started it is held until you subscribe to it, even after other `await`s.

```js
await island.ready;
const count = island.state.get()?.count ?? (await island.storage.get("count")) ?? 0;
island.onShortcut((id) => …); // the shortcut that started this run arrives here
```

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

State is in memory and per plugin: the background and every open panel see the same value. A panel changing it starts an on-demand background. It survives the background stopping when idle, and is gone when the plugin stops (app restart, plugin turned off or updated). Limit: 256 KB as JSON.

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

`id` is a shortcut's `id` from `plugin.json`. Every page of the plugin gets the event, so handle it in one place (usually the background). It starts an on-demand background.

## Alarms

Timers kept by the island. They fire while the background is stopped, starting it, so an on-demand background can do periodic work without staying in memory.

```js
await island.alarms.create("refresh", { every: 15 * 60 }); // every 15 minutes
await island.alarms.create("ring", { delay: 25 * 60 });    // once, in 25 minutes
island.onAlarm((name) => {
  if (name === "refresh") refresh();
});
await island.alarms.list(); // [{ name, due (ms since the epoch), every (s) or null }]
await island.alarms.clear("ring");
await island.alarms.clearAll();
```

`delay` and `every` are seconds, from 30 seconds to 7 days; `delay` defaults to `every`. Creating an alarm with an existing name replaces it. Up to 50 per plugin. They need a background script (they're delivered there), but panels can create and list them too.

Alarms are gone when the plugin stops (app restart, turned off, updated), and the background starts right after, so create them there. An on-demand background runs again on every event, so don't re-create them blindly on each run, or each run would push the next one back:

```js
const [alarm] = await island.alarms.list();
if (alarm?.every !== 900) await island.alarms.create("refresh", { every: 900 });
```

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

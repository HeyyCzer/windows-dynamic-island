# Writing plugins

Plugins add modules (tabs) to the island, along with their own settings, global shortcuts and translations. Users install them from the **marketplace** (Settings → Plugins), which lists every plugin from the sources they added. A source is a GitHub repository that can hold any number of plugins.

| Guide | What's in it |
|---|---|
| This page | How plugins work, quickstart |
| [manifest.md](manifest.md) | `plugin.json`, field by field |
| [sdk.md](sdk.md) | The `island` API your code calls |
| [permissions.md](permissions.md) | What a plugin may do, and how it's enforced |
| [publishing.md](publishing.md) | Source repositories, `island-plugins.json`, packaging, releases |

Examples live in [`examples/plugins/`](../../examples/plugins), which is laid out like a source repository:

- [`counter`](../../examples/plugins/plugins/counter): plain JavaScript, no build step. Background script, panel, settings, shortcut, storage.
- [`pomodoro`](../../examples/plugins/plugins/pomodoro): React + TypeScript + Vite. Compact pill while running, attention when done, panel ↔ background state. A persistent background, since the pill ticks every second.
- [`water`](../../examples/plugins/plugins/water): plain JavaScript. An on-demand background woken up by an alarm, the pattern most plugins should follow.

## How a plugin runs

A plugin is a small website: HTML, JavaScript and CSS, plus a `plugin.json` that declares what it adds. Use whatever you like to build it (React, Svelte, Tailwind, plain DOM). The island loads only the built files.

```
┌────────────────────────── island window ──────────────────────────┐
│  island UI (React)                                                │
│   ├─ host  ◄── postMessage ──►  <iframe sandbox> background page  │
│   │                             (on demand, or always)            │
│   └─ host  ◄── postMessage ──►  <iframe sandbox> panel page       │
│        │                        (while its tab is open)           │
│        ▼                                                          │
│  backend (Rust): permission checks, network, files, storage       │
└───────────────────────────────────────────────────────────────────┘
```

- **Background** (optional): a script that reacts to alarms, shortcuts, settings and panels, and tells the island what to show while it's closed with `island.setView()`. It runs only when there's something to do and stops when idle, unless the manifest makes it [persistent](manifest.md#background-on-demand-or-persistent).
- **Modules**: tabs in the island. Each can have a **panel**, an HTML page shown in the tab's area when it's open. The pill, bubble and tab icon are *declarative*: you describe them (text, icon, color, priority) and the island draws them, so they look native and cost nothing while the island is closed.
- **SDK**: the app injects `window.island` into every page of your plugin before your own scripts run. There's nothing to bundle, and the version always matches the app.

### The sandbox

Every page runs in an `<iframe sandbox="allow-scripts">` served by the app's `plugin://` protocol, with a strict Content Security Policy. A plugin page:

- can load **only its own files**: no CDNs, no remote images or fonts (bundle them),
- has **no network** (`fetch`, WebSocket and WebRTC are blocked): use `island.net.fetch`, limited to hosts you declare,
- has **no storage** (`localStorage` and IndexedDB throw): use `island.storage`,
- can't reach the island's page, the app's APIs or other plugins.

Anything beyond that requires a [permission](permissions.md) that the user approves when installing.

## Quickstart

1. Create a folder with three files:

   **`plugin.json`**
   ```json
   {
     "id": "hello",
     "version": "1.0.0",
     "sdk": "1.0",
     "name": "meta.name",
     "modules": [{ "id": "main", "title": "meta.name", "panel": "panel.html" }]
   }
   ```

   **`locales/en.json`**
   ```json
   { "meta": { "name": "Hello" }, "greeting": "Hello from a plugin!" }
   ```

   **`panel.html`**
   ```html
   <!doctype html>
   <html>
     <head>
       <meta charset="utf-8" />
       <script type="module">
         await island.ready;
         document.body.textContent = island.t("greeting");
       </script>
     </head>
     <body></body>
   </html>
   ```

2. Check it: `node packages/plugin-sdk/cli.mjs validate path/to/hello`.
3. In the app: **Settings → Plugins → Developer mode → Choose…**, then pick your `plugin.json`. The plugin loads straight from the folder. After a change, click **Reload plugins**.
4. Open the island, then the launcher (grid button). Your module is there. Move it to the tab bar from **Settings → Modules**.

### Without Windows

`bun run dev` serves the island in a regular browser with a fake backend. Plugins in `examples/plugins/plugins/` (or their `dist/`) load as if they were installed, with the same SDK, CSP and sandbox. Add your own folder there while you work on it. Open `http://localhost:1420/` for the island and `http://localhost:1420/#settings` for the settings window.

## Versions

- **`sdk`** in `plugin.json` is the SDK version the plugin was written for (`"major.minor"`). A plugin loads when its major version matches the app's and its minor version isn't newer than the app's. The app currently implements **1.0**. A new minor version only adds things; a new major version may break them.
- **`version`** is your plugin's own version (`x.y.z`). The marketplace offers an update when a source lists a newer one.

## Turning plugins off, removing them

Users can turn a whole plugin off (Settings → Plugins → the plugin), turn any of its modules off (Settings → Modules), or remove it, which also deletes its storage.

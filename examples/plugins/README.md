# Example plugins

This folder is laid out like a plugin **source repository**: add it as a source and the marketplace lists every plugin. Read [`docs/plugins/`](../../docs/plugins) first.

| Plugin | Shows |
|---|---|
| [`counter`](plugins/counter) | Plain JavaScript, no build step: on-demand background script, panel, `setView` bubble, settings, a shortcut, storage, translations |
| [`water`](plugins/water) | Plain JavaScript: an on-demand background woken up by an alarm, attention and a peek, the next alarm in the panel |
| [`pomodoro`](plugins/pomodoro) | React + TypeScript + Vite: a persistent background (the pill ticks every second), attention and a peek when a round ends, state shared between the background and the panel |

```sh
# pomodoro is bundled: build it first (dist/ is its package)
cd plugins/pomodoro && bun install && bun run build && cd ../..

# check, pack and index every plugin
node ../../packages/plugin-sdk/cli.mjs index .
```

`index` writes `island-plugins.json` and the zips in `packages/`. The zips aren't committed here: a real source uploads them to its GitHub Releases (`--base-url`, see [publishing.md](../../docs/plugins/publishing.md)).

## Trying them

- **In the app:** Settings → Plugins → Developer mode → pick `plugins/counter/plugin.json` or `plugins/pomodoro/dist/plugin.json`.
- **In a browser:** `bun run dev` at the repository root loads every plugin here (and `dist/` of bundled ones) as if it were installed. The DevTools panel can fire pomodoro's shortcuts.

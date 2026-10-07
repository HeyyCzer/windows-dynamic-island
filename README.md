<div align="center">

<img src="src-tauri/icons/128x128@2x.png" width="112" alt="Dynamic Island icon" />

# Dynamic Island for Windows

An iPhone/MacOS-style Dynamic Island that lives at the top of your Windows desktop — showing what's playing and what your AI coding agents are up to.

[**Download the latest release**](https://github.com/HeyyCzer/windows-dynamic-island/releases/latest)

<img src="docs/screenshots/compact.png" width="576" alt="Compact island showing a Claude Code session waiting for permission" />

</div>

## Features

**Music** — works with Spotify and anything that shows up in Windows' media controls (browsers, Apple Music, VLC…).

- Current track and artist right in the compact island
- Album art, title, artist and a live progress bar you can click to seek
- Play/pause, previous and next
- Audio visualizer that follows the music
- YouTube in a browser: the video itself plays in the island (muted, in sync with the tab), and **Pin** moves it to a small always-on-top window you can drag anywhere (it snaps to edges, scroll to resize)

<p align="center">
  <img src="docs/screenshots/compact-music.png" width="480" alt="Compact island showing the current track and artist" />
  <br />
  <img src="docs/screenshots/music.png" width="700" alt="Expanded music panel" />
</p>

**AI Agents** — live status of your [Claude Code](https://claude.com/claude-code) sessions.

- What each session is doing right now (editing a file, running a command, waiting for permission…) with a turn timer
- Plan usage limits (5-hour session and weekly) with reset countdowns
- Tokens used today, plus a 7-day chart and the last 5 hours from the local transcripts
- Optionally pops open when an agent needs your attention or finishes, with how its reply starts
- Click a session to open its project in VS Code

<p align="center">
  <img src="docs/screenshots/agents.png" width="700" alt="Expanded AI Agents panel with Claude Code sessions" />
</p>

**GitHub** — open issue counts for the repositories you follow.

- A side bubble next to the island with the total, and a panel with each repo and its newest issue
- Optionally pops open when someone opens a new issue
- Works anonymously for public repos; uses your GitHub CLI login automatically, or a token kept in the Windows Credential Manager for private repos

**Ask Claude** — a conversation with Claude right in the island, using your Claude Code login (no API key).

- **Ctrl+Alt+Space** opens it from anywhere (Ctrl+Shift+Space if another app took it); **Esc** gives the keyboard back
- The answer streams in; if you leave, the island tells you when Claude answered
- 📷 attaches a screenshot of the window you were using; files dropped on it (or sent from the shelf) become attachments
- Runs `claude -p` headless with hooks off, so these chats don't show up as sessions. Read-only tools and web search work; for edits it suggests opening Claude Code

**Notifications** — WhatsApp, Teams, Outlook, Discord… mirrored from Windows: each new one pops open with the app's icon, and the tab keeps the recent ones (click to open the app). Windows only lets registered apps read notifications, so **Settings → Notifications → Enable** registers the island once as a sparse package and restarts it; this needs Windows Developer Mode, since the registration isn't signed.

**Live Activities** — short alerts and ongoing activities:

- Volume level bar, charger plugged in/out and low battery, Bluetooth headphones connecting (with their battery) and running low
- Anything a script or app sends through the [local API](#local-api) (downloads, timers, builds…)

**Shelf** — drag files or folders onto the island and it keeps them (by reference) until you drag them out to another app; double-click opens, 💬 asks Claude about one.

**Two looks** — **Settings → Appearance** switches between:

- **Dynamic Island** (default): hangs from the top edge like a notch, tabs with names
- **Windows Island**: a floating pill with a clock at rest, tabs at the bottom and an optional gradient rim (presets like Apple Intelligence, Aurora, Sunset, or two colors of your own; thickness, moving gradient, glow)

**And also**

- Expands on hover (or click), collapses when you leave; the mouse wheel flips through the tabs
- Click the tray icon and the island falls into a black hole (click again to bring it back); right-click for the menu
- A clock tab with the date and the week
- Hides itself while a game, video or app is fullscreen
- Starts with Windows, lives in the tray, checks for updates
- English and Portuguese (Brazil), following your system language by default

<p align="center">
  <img src="docs/screenshots/settings.png" width="640" alt="Settings window, general page" />
</p>

## Install

1. Grab `Dynamic.Island_<version>_x64-setup.exe` from the [latest release](https://github.com/HeyyCzer/windows-dynamic-island/releases/latest).
2. Run it — it installs for your user only, no admin prompt.

Requires Windows 10 or 11 (WebView2 is installed automatically if missing).

### Claude Code integration

Open **Settings → AI Agents → Claude Code integration → Enable**. This adds HTTP hooks (live status) and a statusline bridge to `~/.claude/settings.json`; a backup is written before every change, and your existing statusline keeps working. Restart Claude Code sessions that were already open. Without it, the island still picks up sessions from Claude Code's transcripts, just with less detail.

<p align="center">
  <img src="docs/screenshots/settings-agents.png" width="640" alt="AI Agents settings with the Claude Code integration enabled" />
</p>

**Plan limits** come from the statusline when you use the terminal CLI. Since the statusline doesn't run in the IDE extensions, the island also asks Anthropic directly, using the same endpoint as Claude Code's `/usage`. It authenticates with the OAuth token Claude Code keeps in `~/.claude/.credentials.json`, and that token is only ever sent to `api.anthropic.com`. Requests only happen while the panel is open (at most once a minute) or every few minutes while agents are active.

## Local API

The island listens on `http://127.0.0.1:5199` (localhost only; set `DYNAMIC_ISLAND_PORT` to change it). It's the same API as [Windows Island](https://github.com/PedroRuedas/Windows-Island), so its scripts work unchanged.

| Route | What it does |
| --- | --- |
| `POST /notify` | Alert: pops open and goes away after 5 s (default) |
| `POST /activity` | Live activity: stays until removed or until `duration` runs out. Send the same `id` again to update it |
| `DELETE /activity/{id}` | Removes an activity |
| `GET /status` | Current activities and media (never the content of mirrored notifications) |
| `POST /claude/hook` | Raw Claude Code hook payload (answers `204`) |

JSON fields (all optional, but send `title` or `progress`): `id`, `title`, `subtitle`, `icon` (`bell` `chat` `mail` `call` `download` `upload` `timer` `clock` `calendar` `check` `error` `warning` `info` `code` `sync` `heart` `star` `mic` `camera` `location` `wifi` `bluetooth` `music` `volume` `battery` `charging` `headphones` `folder`, or one character), `color` (`#RRGGBB`), `progress` (0–1), `duration` (seconds), `priority` (0–99, default 50), `action` (an `http(s)` link opened on click), `style` (`"level"` for a level bar) and `expand` (default `true` on `/notify`).

```sh
curl -X POST http://127.0.0.1:5199/notify -H "Content-Type: application/json" \
  -d '{"title":"Deploy done","subtitle":"api v2.3 in production","icon":"check","color":"#30D158"}'
```

Clients for [PowerShell](examples/powershell/DynamicIsland.psm1) (with a [demo](examples/powershell/demo.ps1)), [Python](examples/python/island.py) and [Node](examples/node/island.mjs) are in `examples/`.

## Development

You need [Bun](https://bun.sh) and [Rust](https://rustup.rs) (the version is pinned in `src-tauri/rust-toolchain.toml`).

```sh
bun install
bun run app:dev      # the real app, with hot reload
bun run app:build    # installers in src-tauri/target/release/bundle/
```

`bun run dev` serves the UI alone at http://localhost:1420 with fake data (`src/core/mock.ts`), handy for design work in a normal browser. Add `#settings` to the URL for the settings window, or `#pip` for the pinned video.

### Project layout

```
src/
  core/        island state, provider bridge, settings, appearance, i18n
  modules/     one folder per module (music, ai-agents, ask, notifications, activities, shelf, github, clock),
               each with its own UI and settings
  locales/     translations (*.json5)
  settings/    settings window
  pip/         pinned YouTube video window
src-tauri/src/
  providers/   OS-side data sources, one per module (media controls, Claude Code, GitHub, local API + volume,
               battery and Bluetooth, Windows notifications, `claude -p` chat, shelf)
  window.rs    click-through window + hover hit-testing
  tray.rs      tray menu and black hole
  pip.rs       pinned video window
```

### Adding a language

Copy `src/locales/en.json5` to `src/locales/<code>.json5` (e.g. `es.json5`), translate the values and set `language.name`. That's it — both the UI and the tray pick it up automatically.

### Releasing

```sh
bun run v patch            # bumps package.json, commits and tags vX.Y.Z
git push --follow-tags
```

The tag triggers [the release workflow](.github/workflows/release.yml), which builds the installers and publishes them as a GitHub release.

## License

Copyright © HeyyCzer. Licensed under the [GNU General Public License v3.0](LICENSE) or later.

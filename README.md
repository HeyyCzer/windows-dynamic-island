<div align="center">

<img src="src-tauri/icons/128x128@2x.png" width="112" alt="Dynamic Island icon" />

# Dynamic Island for Windows

An iPhone-style Dynamic Island that lives at the top of your Windows desktop — showing what's playing and what your AI coding agents are up to.

[**Download the latest release**](https://github.com/HeyyCzer/windows-dynamic-island/releases/latest)

<img src="docs/screenshots/compact.png" width="500" alt="Compact island showing a Claude Code session waiting for permission" />

</div>

## Features

**Music** — works with Spotify and anything that shows up in Windows' media controls (browsers, Apple Music, VLC…).

- Album art, title, artist and a live progress bar you can click to seek
- Play/pause, previous and next
- Audio visualizer that follows the music

<img src="docs/screenshots/music.png" width="700" alt="Expanded music panel" />

**AI Agents** — live status of your [Claude Code](https://claude.com/claude-code) sessions.

- What each session is doing right now (editing a file, running a command, waiting for permission…) with a turn timer
- Plan usage limits (5-hour session and weekly) with reset countdowns
- Tokens used today
- Optionally pops open when an agent needs your attention or finishes

<img src="docs/screenshots/agents.png" width="700" alt="Expanded AI Agents panel with Claude Code sessions" />

**And also**

- Expands on hover (or click), collapses when you leave
- Hides itself while a game, video or app is fullscreen
- Starts with Windows, lives in the tray
- English and Portuguese (Brazil), following your system language by default

<img src="docs/screenshots/settings.png" width="520" alt="Settings window" />

## Install

1. Grab `Dynamic.Island_<version>_x64-setup.exe` from the [latest release](https://github.com/HeyyCzer/windows-dynamic-island/releases/latest).
2. Run it — it installs for your user only, no admin prompt.

Requires Windows 10 or 11 (WebView2 is installed automatically if missing).

### Claude Code integration

Open **Settings → AI Agents → Claude Code integration → Enable**. This adds HTTP hooks (live status) and a statusline bridge (plan limits) to `~/.claude/settings.json`; a backup is written before every change, and your existing statusline keeps working. Restart Claude Code sessions that were already open. Without it, the island still picks up sessions from Claude Code's transcripts, just with less detail.

## Development

You need [Bun](https://bun.sh) and [Rust](https://rustup.rs) (the version is pinned in `src-tauri/rust-toolchain.toml`).

```sh
bun install
bun run app:dev      # the real app, with hot reload
bun run app:build    # installers in src-tauri/target/release/bundle/
```

`bun run dev` serves the UI alone at http://localhost:1420 with fake data (`src/core/mock.ts`), handy for design work in a normal browser. Add `#settings` to the URL for the settings window.

### Project layout

```
src/
  core/        island state, provider bridge, settings, i18n
  modules/     one folder per module (music, ai-agents), each with its own UI and settings
  locales/     translations (*.json5)
  settings/    settings window
src-tauri/src/
  providers/   OS-side data sources, one per module (media controls, Claude Code)
  window.rs    click-through window + hover hit-testing
  tray.rs      tray menu
```

### Adding a language

Copy `src/locales/en.json5` to `src/locales/<code>.json5` (e.g. `es.json5`), translate the values and set `language.name`. That's it — both the UI and the tray pick it up automatically.

### Releasing

```sh
bun run v patch            # bumps package.json, commits and tags vX.Y.Z
git push --follow-tags
```

The tag triggers [the release workflow](.github/workflows/release.yml), which builds the installers and publishes them as a GitHub release.

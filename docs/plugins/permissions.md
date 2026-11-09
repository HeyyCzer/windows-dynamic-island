# Permissions and security

A plugin runs isolated by default. Anything that reaches outside its own pages requires a permission declared in `plugin.json`:

```json
"permissions": ["network:api.github.com", "clipboard:write", "open-url"]
```

The marketplace shows them in plain words before installing ("Connect to api.github.com"). The user approves all of them or doesn't install. If an update asks for more, the user approves it again, and the app refuses a package that asks for more than its index listed.

| Permission | Lets the plugin |
|---|---|
| `network:<host>` | `island.net.fetch` to `https://<host>`. `*.example.com` also covers `example.com` and its subdomains. `host:port` limits it to one port. |
| `clipboard:read` | Read text from the clipboard |
| `clipboard:write` | Put text on the clipboard |
| `open-url` | Open `https://` links in the default browser |
| `fs:read:<pattern>` | Read text files matching the pattern |
| `provider:<id>` | Read the state of a built-in module: `music`, `monitor` |

`fs:read` patterns start with `$HOME`, `$APPDATA`, `$LOCALAPPDATA` or `$DOCUMENTS`:

| Pattern | Matches |
|---|---|
| `$HOME/.config/tool/state.json` | that file |
| `$HOME/notes/*` | files directly in `notes` |
| `$HOME/notes/**` | anything below `notes` |

Wildcards can only be the last part (`*` or `**`), and `..` isn't allowed.

These don't need permissions: the plugin's own storage, settings, state, translations and views, opening or closing the island, and its own shortcuts.

**Ask for as little as you can.** Name exact hosts, not wildcards, and the narrowest folder that works. Users read this list.

## How it's enforced

Several layers, so a mistake in one doesn't open everything:

1. **Sandboxed iframe** (`sandbox="allow-scripts"`). Each page gets an opaque origin, so it has no access to the island's page, no cookies or storage, no popups, no forms, and no top-level navigation.
2. **Content Security Policy** on every file the `plugin://` protocol serves. It allows only the plugin's own files and the SDK: `connect-src 'none'` blocks fetch, XHR, WebSocket and EventSource, remote images, fonts and media are blocked, and so are frames and workers. The SDK also removes WebRTC, which CSP doesn't cover.
3. **Navigation guard.** On Windows, a plugin frame can't navigate away from the `plugin://` protocol.
4. **No app API.** The app's IPC isn't available inside plugin frames. A plugin only reaches the app through `postMessage` to the island's host, which identifies it by the frame the message came from, never by anything the message claims.
5. **The backend checks again.** Network, file and clipboard calls are checked in Rust against the permissions the user granted, so even a bug in the host can't widen them. Network requests don't follow redirects, so a granted host can't bounce the plugin elsewhere.
6. **Integrity.**
   - When installing, the package's SHA-256 has to match the one in the source's index, or nothing is unpacked.
   - Unpacking rejects entries that would land outside the plugin's folder, links, and oversized archives.
   - The SHA-256 of every file is recorded. At every start, a plugin whose files changed or went missing doesn't load ("its files changed after it was installed"), and every file served to it is checked against its hash again.

### What the hashes do and don't promise

They guarantee that what runs is **exactly what the source published** when you installed it, and that nothing changed it on disk afterwards. They don't say **who** wrote it: whoever controls the source's repository controls its index and hashes. Only add sources you trust, the way you would with browser extensions. Signed sources (a key pinned when adding the source) are on the roadmap.

### Developer mode

Plugins loaded from a folder are served as they are, without hashes, so you can rebuild and reload them. They're marked **Developer** in the settings. Their permissions are granted as declared, since you're the author.

### Known limits

- CSP doesn't cover a page navigating *itself* to another URL, which could carry data out through the address. On Windows the app cancels any navigation of a plugin frame that leaves the `plugin://` protocol (WebView2 frame events). Other platforms aren't supported by the app.
- Plugin panels share the island's renderer budget: a plugin that spins the CPU slows the island down. Turn it off or remove it.

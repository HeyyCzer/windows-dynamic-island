# Publishing plugins

Users add **sources** in Settings → Plugins → Sources. A source is usually a GitHub repository, and the marketplace lists every plugin its index names. One repository can hold any number of plugins. That's how an official `island-windows-plugins` repository would work.

A source can be given as:

| Input | Index read from |
|---|---|
| `owner/repo` | `https://raw.githubusercontent.com/owner/repo/HEAD/island-plugins.json` |
| `owner/repo@v2` (branch, tag or commit) | `…/owner/repo/v2/island-plugins.json` |
| `https://github.com/owner/repo` (or `/tree/<ref>`) | same as above |
| `https://any.host/path/island-plugins.json` | that URL (HTTPS only) |

## Repository layout

```
your-plugins/
├─ island-plugins.json          ← the index (generated)
├─ packages/                    ← zips (generated; or upload them to Releases)
│  ├─ counter-1.0.0.zip
│  └─ pomodoro-1.2.0.zip
└─ plugins/
   ├─ counter/                  ← plain JS: the folder *is* the package
   │  ├─ plugin.json
   │  ├─ background.js
   │  ├─ panel.html
   │  ├─ icon.svg
   │  └─ locales/en.json
   └─ pomodoro/                 ← bundled: dist/ is the package
      ├─ package.json, vite.config.ts, src/…
      ├─ public/                ← plugin.json, locales/, icons: copied into dist/
      └─ dist/                  ← build output, with plugin.json at its root
```

A **package** is a folder with `plugin.json` at its root. For plain-JS plugins it's the plugin's own folder. For bundled ones it's the build output (`dist/`). Put `plugin.json`, `locales/` and icons in Vite's `public/` so they're copied over as they are.

## The index: `island-plugins.json`

```json
{
  "schema": 1,
  "name": { "en": "Example plugins", "pt-BR": "Plugins de exemplo" },
  "plugins": [
    {
      "id": "counter",
      "version": "1.0.0",
      "sdk": "1.0",
      "name": { "en": "Counter", "pt-BR": "Contador" },
      "description": { "en": "…", "pt-BR": "…" },
      "author": "Island for Windows",
      "homepage": "https://github.com/you/your-plugins",
      "icon": "plugins/counter/icon.svg",
      "permissions": [],
      "package": "packages/counter-1.0.0.zip",
      "sha256": "a92a7992dd86b7aef8e6b5737a309928a3437ac367b200ec2a2d2e4e9d8cb4a1"
    }
  ]
}
```

- `name` and `description` can be plain strings or one per locale.
- `icon` and `package` are absolute HTTPS URLs or relative to the index.
- `sha256` is the package's hash. The app refuses a package that doesn't match it.
- `permissions` is what the marketplace shows before installing. The package's `plugin.json` can't ask for more.
- `persistent: true` when the plugin's background never stops (see [manifest.md](manifest.md#background-on-demand-or-persistent)). The marketplace shows it, and the app refuses a persistent package whose listing doesn't say so. `island-plugin index` fills it in.
- An entry that doesn't make sense (bad version, `http://` URL, bad hash) is skipped, and the rest of the source still shows.

Don't write it by hand: the CLI generates it.

## The CLI

`packages/plugin-sdk/cli.mjs` (`island-plugin` once the SDK is published to npm) runs on Node 18+ or Bun and has no dependencies.

```sh
island-plugin validate plugins/counter      # same checks as the app, plus missing translations
island-plugin pack plugins/counter out/     # → out/counter-1.0.0.zip and its SHA-256
island-plugin index .                       # pack every plugins/*, write island-plugins.json
island-plugin index . --base-url https://github.com/you/your-plugins/releases/download/v1
```

`index` looks for `plugins/<name>/plugin.json`, or `plugins/<name>/dist/plugin.json` for bundled plugins (build them first). It packs each one into `packages/<id>-<version>.zip`, then copies their names and descriptions from their locales into the index. Zips are deterministic: the same files always give the same hash, so rebuilding doesn't churn the index.

## Hosting the packages

Pick one:

- **Commit them** (`packages/` in the repo, relative URLs). Simplest. Fine for small plugins.
- **GitHub Releases** (recommended). Run `index --base-url https://github.com/<owner>/<repo>/releases/download/<tag>`, upload `packages/*.zip` to that release, commit only `island-plugins.json`, and keep `packages/` in `.gitignore`.

Either way, the hash lives in the index, so whatever is downloaded has to match it.

A GitHub Actions workflow can do this on every tag:

```yaml
on: { push: { tags: ["v*"] } }
permissions: { contents: write }
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: cd plugins/pomodoro && bun install && bun run build
      - run: bunx @windows-island/plugin-sdk index . --base-url "https://github.com/${{ github.repository }}/releases/download/${{ github.ref_name }}"
      - run: gh release create "${{ github.ref_name }}" packages/*.zip
        env: { GH_TOKEN: "${{ github.token }}" }
      - run: |
          git config user.name github-actions && git config user.email github-actions@github.com
          git add island-plugins.json && git commit -m "index ${{ github.ref_name }}" && git push origin HEAD:main
```

## Updating a plugin

1. Bump `version` in `plugin.json`, and `sdk` too if you use something newer.
2. Run `index` again and publish.
3. Users see **Update to x.y.z** in the marketplace. If the new version asks for more permissions, they approve them again.

Never reuse a version number for different files: the hash in users' indexes wouldn't match anymore.

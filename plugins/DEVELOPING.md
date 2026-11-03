# Independent plugin packages

Plugins are built as separate `.island-plugin.json` files. The desktop app contains the shared React/UI SDK and the downloader; plugin panel code and plugin-only styles are fetched on install and stored under the app's plugin cache. Updating a plugin does not replace the app. The marketplace compares package SHA-256 values and lets the user download updates individually.

## Release flow

Edit a widget under `src/core/plugins/widgets`, its metadata in `catalog.source.ts`, and its guide in `guides.ts`. The build entry map in `scripts/build-plugins.ts` connects each plugin id to its widget. Increase that plugin's `version` in the source catalog when its behavior changes. Keep plugin UI on the shared `components/ui` components and design tokens.

Run `bun run plugins:build` to produce packages and `plugins/catalog.json`. Commit the source and generated catalog to `main`, then run `scripts/publish-plugins.ps1`. It creates or replaces assets on the separate `plugins` prerelease; this does not publish a desktop app release. The package SHA in the catalog must match the released file.

## Runtime contract

Set `sdkVersion: 1` in generated package metadata. A widget exports one React panel. Optional `Background` exports own persistent work such as timers and VPN polling; it is mounted while the plugin is enabled and cleaned up when disabled or removed. Optional `diagnose(settings)` returns a diagnostic result. Plugin settings and enablement are retained across package updates.

Packages execute in the app's WebView and share its React runtime. The installer shows a trust confirmation because plugin code can access host APIs and app-window data. SHA-256 detects mismatched downloads; it does not sandbox code or certify its publisher.

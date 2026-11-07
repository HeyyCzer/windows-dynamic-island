# `plugin.json`

The manifest sits at the root of a plugin package. The app validates it when installing and again at every start. A plugin with an invalid manifest doesn't load, and the settings show why.

Every user-visible text field (`name`, titles, labels, units) is a **key into your locales**, not the text itself. See [Translations](#translations).

Add `"$schema": "https://raw.githubusercontent.com/HeyyCzer/windows-island/main/packages/plugin-sdk/plugin.schema.json"` for autocompletion in your editor.

```jsonc
{
  "id": "pomodoro",                 // required
  "version": "1.2.0",               // required
  "sdk": "1.0",                     // required
  "name": "meta.name",              // required (locale key)
  "description": "meta.description",
  "author": "Your Name",
  "homepage": "https://github.com/you/your-plugins",
  "icon": "icon.svg",
  "background": "background.js",
  "persistent": false,
  "modules": [ … ],
  "settings": [ … ],
  "shortcuts": [ … ],
  "permissions": [ … ]
}
```

| Field | | |
|---|---|---|
| `id` | required | 2–48 characters: `a-z`, `0-9`, `-` (not at the start or end). Must be unique across every source the user has. Pick something specific (`acme-weather`, not `weather`). Never change it: settings, storage and shortcuts are keyed by it. |
| `version` | required | `major.minor.patch`, optionally `-pre` (`1.0.0-beta.2`). |
| `sdk` | required | SDK version you wrote against: `"1.0"`. See [Versions](README.md#versions). |
| `name` | required | Locale key of the plugin's name. |
| `description` | | Locale key of a one-line description. |
| `author` | | Shown as is. |
| `homepage` | | `https://` link. |
| `icon` | | Path of an image in the package (SVG or PNG, square). Used in the settings and as the default module icon. |
| `background` | | Path of a `.js` file (the app wraps it in a page, as an ES module) or an `.html` page. Runs when something happens, see below. |
| `persistent` | | `true` keeps the background running for as long as the plugin is on. Default `false`. See below. |
| `modules` | | Tabs the plugin adds. |
| `settings` | | Settings shown on the plugin's page. |
| `shortcuts` | | Global shortcuts the plugin reacts to. |
| `permissions` | | See [permissions.md](permissions.md). |

A plugin needs at least a module or a background script. Paths are relative to the package root, use `/`, and can't leave the package.

## Background: on demand or persistent

Every running page costs memory (a few MB each, more with a framework like React), and the island runs all day. So by default a background is **on demand**: the island starts it when there's something for it, delivers the events, and stops it about 5 seconds after its last call or event (60 seconds at most per run). It's started when:

- the plugin turns on (app start, install, update, turned back on), so it can set its views and alarms,
- one of its [alarms](sdk.md#alarms) fires,
- one of its shortcuts is pressed,
- a panel changes `island.state`,
- its settings or the app's language change.

Views, `island.state` and alarms are kept by the island, so they stay while the background is stopped. Variables and timers in the page don't: keep what has to last in `island.state` or `island.storage`, and use `island.alarms` instead of `setInterval`.

Set `"persistent": true` only when the background has to keep running, like a timer that updates the pill every second. The marketplace and the settings show **Runs in the background** for these plugins.

## `modules`

```json
{
  "id": "timer",
  "title": "timer.title",
  "icon": "icons/timer.svg",
  "panel": "panel.html",
  "size": { "width": 560, "height": 190 },
  "enabledByDefault": true
}
```

| Field | | |
|---|---|---|
| `id` | required | `a-z`, `0-9`, `-`, unique within the plugin. |
| `title` | required | Locale key of the tab's name. |
| `icon` | | Image in the package. Defaults to the plugin's icon. |
| `panel` | | HTML page shown when the tab is open. Without one, the tab shows the module's title. |
| `size` | | Panel size in px: width 160–900, height 60–600. Default 560 × 190. The tab bar needs about 560px of width. |
| `enabledByDefault` | | `false` installs the module turned off. Default `true`. |

Each module behaves like a built-in one: users can reorder it, choose whether it sits in the tab bar or only in the launcher, turn it off, and give it an "open" shortcut, all from Settings → Modules.

## `settings`

Settings appear on the plugin's page in Settings, and your code reads them with `island.settings`.

```json
[
  { "key": "work", "type": "number", "label": "settings.work", "description": "settings.workDesc",
    "default": 25, "min": 1, "max": 120, "step": 1, "unit": "units.minutes" },
  { "key": "sound", "type": "boolean", "label": "settings.sound", "default": true },
  { "key": "theme", "type": "select", "label": "settings.theme", "default": "auto",
    "options": [{ "value": "auto", "label": "settings.auto" }, { "value": "red", "label": "settings.red" }] },
  { "key": "token", "type": "string", "label": "settings.token", "default": "", "secret": true }
]
```

| Field | | |
|---|---|---|
| `key` | required | `a-z`, `0-9`, `-`. |
| `type` | required | `boolean`, `number`, `string` or `select`. |
| `label` | required | Locale key. |
| `description` | | Locale key. |
| `default` | required | Must fit the type (and `min`/`max`, or one of the `options`). |
| `min`, `max`, `step` | | Numbers only. |
| `unit` | | Numbers only: locale key of the unit shown after the field. |
| `options` | | Selects only: `{ "value", "label" }`, with `label` a locale key. |
| `secret` | | Strings only: hides the text while typing. Stored like any other setting, so it isn't encrypted. |

## `shortcuts`

```json
[{ "id": "toggle", "label": "shortcuts.toggle", "default": "Ctrl+Alt+P" }]
```

The user can change or turn off every shortcut, both on the plugin's page and under Settings → Keyboard shortcuts. `default` is only a suggestion: if another app holds it, the shortcut stays off until the user picks other keys. When one is pressed, your pages get `island.onShortcut(id)`.

Key names follow the app's syntax: modifiers `Ctrl`, `Alt`, `Shift`, `Super` (Win), then a key such as `A`–`Z`, `0`–`9`, `F1`–`F24`, `Space`, `Enter`, `ArrowUp`. Function keys may go without a modifier.

## Translations

Put one JSON file per language in `locales/`. File names are BCP 47 codes, like the app's own: `en.json`, `pt-BR.json`, `zh-CN.json`. **`locales/en.json` is required**, and English fills in any key missing from other languages. Nesting is flattened to dotted keys:

```json
{ "meta": { "name": "Pomodoro" }, "timer": { "left": "{minutes} min left" } }
```

```js
island.t("timer.left", { minutes: 12 }); // "12 min left"
```

The app picks your file for its current language (an exact match first, then the same language, e.g. `pt` for `pt-BR`), and tells your pages when it changes (`island.onLocaleChange`). The marketplace shows your name and description in the user's language too: `island-plugin index` copies them from your locales into the index.

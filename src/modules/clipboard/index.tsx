/**
 * Clipboard — what you copy shows up in the island for a moment, screenshots
 * open it with the picture, and the latest items stay listed to copy again,
 * drag out, keep on the shelf or ask Claude about.
 * Backend: `src-tauri/src/providers/clipboard/`.
 */
import { Glyph } from "../../components/Glyph";
import { useProvider } from "../../core/bridge";
import { useT } from "../../core/i18n";
import { useSetting } from "../../core/settings";
import type { IslandModule, ModuleView } from "../../core/types";
import { useNow } from "../ai-agents/common/format";
import { ClipboardCompactLeft, ClipboardCompactRight } from "./components/ClipboardCompact";
import { ClipboardPanel } from "./components/ClipboardPanel";
import { clipboardSettings } from "./settings";
import { CLIPBOARD_PROVIDER, CLIPBOARD_YELLOW, type ClipboardState } from "./types";
import "./clipboard.css";

/** The "copied" pill stays this long. */
const FLASH_MS = 3000;
/** A fresh picture is shown big in the panel for this long. */
const HERO_MS = 20_000;
const ROW = 48;
const MAX_ROWS = 4;

function ClipboardSettings() {
  const t = useT();
  return (
    <div className="settings-block">
      <span className="settings-desc">{t("clipboard.privacy")}</span>
    </div>
  );
}

export const clipboardModule: IslandModule = {
  id: "clipboard",
  title: "clipboard.title",
  settingsIcon: <Glyph name="clipboard" size={14} />,
  settings: Object.values(clipboardSettings),
  SettingsSection: ClipboardSettings,
  useView(): ModuleView {
    const state = useProvider<ClipboardState>(CLIPBOARD_PROVIDER);
    const showOnCopy = useSetting(clipboardSettings.showOnCopy);
    const peekOnScreenshot = useSetting(clipboardSettings.peekOnScreenshot);
    const items = state?.items ?? [];
    const latest = items[0];
    const fresh = !!latest && !latest.quiet && Date.now() - latest.copiedAt < HERO_MS;
    // Re-render while something is fresh, so the pill and the hero go away on time.
    const now = useNow(500, fresh);
    const age = latest ? now - latest.copiedAt : Infinity;

    const flashing = showOnCopy && !!latest && !latest.quiet && age < FLASH_MS;
    const hero = !!latest && latest.kind === "image" && !latest.quiet && age < HERO_MS;
    const listed = hero ? items.length - 1 : items.length;
    const rows = hero ? Math.min(listed, 1) : Math.min(Math.max(listed, 1), MAX_ROWS);

    return {
      active: flashing,
      // A 3 s flash: above music and a working/finished agent, under an agent
      // waiting for permission and the system alerts (volume…).
      priority: 75,
      hidden: items.length === 0,
      accent: CLIPBOARD_YELLOW,
      icon: <Glyph name="clipboard" size={14} color={CLIPBOARD_YELLOW} />,
      compact: latest && {
        left: <ClipboardCompactLeft item={latest} />,
        right: <ClipboardCompactRight />,
        width: 340,
      },
      expanded: <ClipboardPanel state={state} hero={hero} />,
      expandedSize: { width: 560, height: 46 + (hero ? 124 : 0) + rows * ROW },
      activityKey:
        peekOnScreenshot && latest?.screenshot && !latest.quiet ? `shot:${latest.id}:${latest.copiedAt}` : undefined,
    };
  },
};

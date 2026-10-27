import { useEffect, useState } from "react";
import { CloseIcon } from "../../components/icons";
import { providerAction, useProvider } from "../../core/bridge";
import { useT } from "../../core/i18n";
import { readSetting, setSetting } from "../../core/settings";
import {
  comboOf,
  modifiersOf,
  SHORTCUTS_PROVIDER,
  shortcutSettings,
  showKeys,
  type ShortcutId,
  type ShortcutsState,
} from "../../core/shortcuts";

/** A global shortcut: click, then press the new combination (Esc cancels). */
export function ShortcutRow({ id, values }: { id: ShortcutId; values: Record<string, unknown> }) {
  const t = useT();
  const def = shortcutSettings[id];
  const status = useProvider<ShortcutsState>(SHORTCUTS_PROVIDER)?.[id];
  const chosen = readSetting(values, def);
  const [recording, setRecording] = useState(false);
  const [held, setHeld] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    // The current combination would fire instead of reaching this window.
    providerAction(SHORTCUTS_PROVIDER, "pause");
    const stop = () => setRecording(false);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === "keyup") return setHeld(modifiersOf(e));
      if (e.code === "Escape" && !modifiersOf(e).length) return stop();
      const combo = comboOf(e);
      if (!combo) return setHeld(modifiersOf(e));
      const other = (Object.keys(shortcutSettings) as ShortcutId[]).find(
        (o) => o !== id && (readSetting(values, shortcutSettings[o]) ?? shortcutSettings[o].fallback) === combo,
      );
      if (other) setError(t("shortcuts.duplicate", { keys: showKeys(combo), action: t(shortcutSettings[other].label) }));
      else {
        setError(null);
        setSetting(def, combo);
      }
      stop();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("blur", stop);
      setHeld([]);
      providerAction(SHORTCUTS_PROVIDER, "resume");
    };
  }, [recording, id, def, values, t]);

  const keys = chosen ?? def.fallback;
  const label = recording
    ? held.length
      ? `${showKeys(held.join("+"))}+…`
      : t("shortcuts.press")
    : keys
      ? showKeys(status?.keys && chosen === null ? status.keys : keys)
      : t("shortcuts.off");
  const taken = !recording && status?.taken;

  return (
    <div className="settings-row is-static">
      <div className="settings-text">
        <span className="settings-label">{t("shortcuts.label")}</span>
        {error ? (
          <span className="settings-error">{error}</span>
        ) : taken ? (
          <span className="settings-error">{t("shortcuts.taken", { keys: showKeys(taken) })}</span>
        ) : (
          <span className="settings-desc">{t("shortcuts.desc")}</span>
        )}
      </div>
      <div className="shortcut-actions">
        {chosen !== null && (
          <button className="shortcut-reset" onClick={() => setSetting(def, null)}>
            {t("shortcuts.reset")}
          </button>
        )}
        <button
          className={`shortcut-keys ${recording ? "is-recording" : ""} ${keys ? "" : "is-off"}`}
          onClick={() => {
            setError(null);
            setRecording((r) => !r);
          }}
        >
          {label}
        </button>
        {keys && !recording && (
          <button className="shortcut-clear" title={t("shortcuts.disable")} onClick={() => setSetting(def, "")}>
            <CloseIcon size={10} />
          </button>
        )}
      </div>
    </div>
  );
}
